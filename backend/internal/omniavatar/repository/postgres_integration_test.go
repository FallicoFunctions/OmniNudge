package repository

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/omniavatar/pipeline"
	"github.com/stretchr/testify/require"
)

func TestPostgresRepositoryLeaseLifecycle(t *testing.T) {
	db, err := database.NewTest()
	if err != nil {
		t.Skipf("PostgreSQL test database unavailable: %v", err)
	}
	t.Cleanup(db.Close)
	ctx := context.Background()
	schema := "omniavatar_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	_, err = db.Pool.Exec(ctx, "CREATE SCHEMA "+quotedSchema)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = db.Pool.Exec(context.Background(), "DROP SCHEMA IF EXISTS "+quotedSchema+" CASCADE")
	})

	config, err := pgxpool.ParseConfig(db.Pool.Config().ConnString())
	require.NoError(t, err)
	config.ConnConfig.RuntimeParams["search_path"] = schema
	config.MinConns = 0
	config.MaxConns = 4
	pool, err := pgxpool.NewWithConfig(ctx, config)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.NoError(t, pool.Ping(ctx))
	_, err = pool.Exec(ctx, `CREATE TABLE users (id BIGINT PRIMARY KEY)`)
	require.NoError(t, err)
	for _, migration := range []string{
		"111_omniavatar_pipeline_jobs.up.sql",
		"112_omniavatar_worker_leases.up.sql",
		"113_omniavatar_provider_dispatch_outbox.up.sql",
	} {
		contents, readErr := os.ReadFile(migrationPath(t, migration))
		require.NoError(t, readErr)
		_, execErr := pool.Exec(ctx, string(contents))
		require.NoError(t, execErr)
	}
	_, err = pool.Exec(ctx, `INSERT INTO users (id) VALUES (42)`)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		INSERT INTO omniavatar_jobs (
			id, owner_id, state, retry_count, max_retries, version,
			idempotency_key, created_at, updated_at
		) VALUES (
			'00000000-0000-1000-8000-000000000001', 42, 'queued', 0, 2, 1,
			'invalid-version-0001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
		)
	`)
	require.Error(t, err)

	repository, err := NewPostgresRepository(pool)
	require.NoError(t, err)
	_, err = repository.GetOwned(ctx, "not-a-uuid", 42)
	require.ErrorIs(t, err, pipeline.ErrJobNotFound)
	_, err = repository.GetSystem(ctx, "not-a-uuid")
	require.ErrorIs(t, err, pipeline.ErrJobNotFound)
	createdAt := time.Now().UTC().Add(-time.Minute)
	job, err := pipeline.NewJob(42, 2, createdAt)
	require.NoError(t, err)
	err = repository.UpdateLeased(ctx, job, 0, uuid.NewString(), "worker-a", time.Now())
	require.ErrorIs(t, err, pipeline.ErrJobVersionConflict)
	stored, created, err := repository.Create(ctx, job, "omniavatar-postgres-lease-0001")
	require.NoError(t, err)
	require.True(t, created)
	_, err = pool.Exec(ctx, `
		UPDATE omniavatar_jobs
		SET lease_token = '00000000-0000-1000-8000-000000000001',
		    leased_by = 'worker-a', lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '1 minute'
		WHERE id = $1
	`, stored.ID)
	require.Error(t, err)

	lease, err := repository.ClaimNext(ctx, "worker-a", time.Now(), time.Minute)
	require.NoError(t, err)
	require.Equal(t, stored.ID, lease.Job.ID)
	require.Equal(t, 1, lease.Attempt)
	var lastClaimedRecorded bool
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT last_claimed_at IS NOT NULL FROM omniavatar_jobs WHERE id = $1`, stored.ID,
	).Scan(&lastClaimedRecorded))
	require.True(t, lastClaimedRecorded)
	_, err = repository.ClaimNext(ctx, "worker-b", time.Now(), time.Minute)
	require.ErrorIs(t, err, pipeline.ErrNoClaimableJobs)
	renewed, err := repository.RenewLease(ctx, stored.ID, lease.Token, lease.WorkerID, time.Now(), 2*time.Minute)
	require.NoError(t, err)
	require.True(t, renewed.After(lease.ExpiresAt))
	shortRenewal, err := repository.RenewLease(ctx, stored.ID, lease.Token, lease.WorkerID, time.Now(), time.Minute)
	require.NoError(t, err)
	require.Equal(t, renewed, shortRenewal)

	advanced := cloneJob(lease.Job)
	require.NoError(t, advanced.Advance(pipeline.StateValidatingImage, nil, time.Now().UTC()))
	require.NoError(t, repository.UpdateLeased(ctx, advanced, lease.Job.Version, lease.Token, lease.WorkerID, time.Now()))
	persisted, err := repository.GetOwned(ctx, stored.ID, 42)
	require.NoError(t, err)
	require.Equal(t, pipeline.StateValidatingImage, persisted.State)
	var firstEvidenceIsNull bool
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT evidence IS NULL
		FROM omniavatar_job_events
		WHERE job_id = $1 AND sequence = 1
	`, stored.ID).Scan(&firstEvidenceIsNull))
	require.True(t, firstEvidenceIsNull)

	secondLease, err := repository.ClaimNext(ctx, "worker-b", time.Now(), time.Minute)
	require.NoError(t, err)
	require.Equal(t, 2, secondLease.Attempt)
	forged := cloneJob(secondLease.Job)
	forged.CreatedAt = forged.CreatedAt.Add(-time.Hour)
	forgedTransitionAt := time.Now().UTC()
	forgedEvidence := testEvidence(forged.ID)
	forgedEvidence.CreatedAt = forgedTransitionAt
	require.NoError(t, forged.Advance(pipeline.StateGeneratingViews, forgedEvidence, forgedTransitionAt))
	err = repository.UpdateLeased(ctx, forged, secondLease.Job.Version, secondLease.Token, secondLease.WorkerID, time.Now())
	require.ErrorIs(t, err, pipeline.ErrJobVersionConflict)

	cancelled := cloneJob(secondLease.Job)
	require.NoError(t, cancelled.Cancel(time.Now().UTC()))
	require.NoError(t, repository.UpdateOwnedCancellation(ctx, cancelled, secondLease.Job.Version))
	stale := cloneJob(secondLease.Job)
	transitionAt := time.Now().UTC()
	evidence := testEvidence(stale.ID)
	evidence.CreatedAt = transitionAt
	require.NoError(t, stale.Advance(pipeline.StateGeneratingViews, evidence, transitionAt))
	err = repository.UpdateLeased(ctx, stale, secondLease.Job.Version, secondLease.Token, secondLease.WorkerID, time.Now())
	require.ErrorIs(t, err, pipeline.ErrLeaseLost)

	service, err := pipeline.NewService(repository)
	require.NoError(t, err)
	dispatchJob, _, err := service.CreateJob(ctx, 42, 2, "omniavatar-postgres-dispatch-0001")
	require.NoError(t, err)
	for _, next := range []pipeline.State{pipeline.StateValidatingImage, pipeline.StateGeneratingViews, pipeline.StateCheckingConsistency} {
		stageLease, claimErr := service.ClaimNextJob(ctx, "stage-worker", time.Minute)
		require.NoError(t, claimErr)
		var stageEvidence *pipeline.Evidence
		if stageLease.Job.State != pipeline.StateQueued {
			stageEvidence = testStageEvidence(stageLease.Job.ID, string(stageLease.Job.State), time.Now().UTC())
		}
		dispatchJob, err = service.AdvanceLeasedJob(ctx, stageLease, next, stageEvidence)
		require.NoError(t, err)
	}
	stageLease, err := service.ClaimNextJob(ctx, "stage-worker", time.Minute)
	require.NoError(t, err)
	consistencyEvidence := testStageEvidence(dispatchJob.ID, string(dispatchJob.State), time.Now().UTC())
	dispatchJob, queuedDispatch, err := service.AdvanceLeasedJobWithProviderDispatch(
		ctx, stageLease, consistencyEvidence, testReferenceSet(dispatchJob), "provider-a", "multiview-v1", 100,
	)
	require.NoError(t, err)
	require.Equal(t, pipeline.StateReconstructing, dispatchJob.State)
	var persistedRequest []byte
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT request FROM omniavatar_provider_dispatches WHERE id = $1`, queuedDispatch.ID,
	).Scan(&persistedRequest))
	require.Contains(t, string(persistedRequest), queuedDispatch.Request.IdempotencyKey)
	t.Logf("peer-received PostgreSQL request: %s", persistedRequest)
	dispatchLease, err := service.ClaimNextProviderDispatch(ctx, "dispatch-worker", time.Minute)
	require.NoError(t, err)
	require.Equal(t, queuedDispatch.ID, dispatchLease.Dispatch.ID)
	_, err = service.MarkProviderDispatchSubmitted(ctx, dispatchLease, pipeline.ProviderTask{
		Provider: "wrong-provider", Model: "multiview-v1", TaskID: "provider-task-postgres-0001",
	})
	require.ErrorContains(t, err, "immutable dispatch route")
	require.NotEmpty(t, dispatchLease.Token)
	submitted, err := service.MarkProviderDispatchSubmitted(ctx, dispatchLease, pipeline.ProviderTask{
		Provider: "provider-a", Model: "multiview-v1", TaskID: "provider-task-postgres-0001",
	})
	require.NoError(t, err)
	require.Equal(t, pipeline.DispatchSubmitted, submitted.Status)
	_, err = service.MarkProviderDispatchSubmitted(ctx, dispatchLease, *submitted.Task)
	require.ErrorIs(t, err, pipeline.ErrDispatchLeaseLost)

	_, err = pool.Exec(ctx, `
		UPDATE omniavatar_job_events
		SET evidence = '{"unexpected": true}'::jsonb
		WHERE job_id = $1 AND sequence = 1
	`, stored.ID)
	require.NoError(t, err)
	_, err = repository.GetOwned(ctx, stored.ID, 42)
	require.ErrorContains(t, err, "unknown field")

	for _, migration := range []string{
		"113_omniavatar_provider_dispatch_outbox.down.sql",
		"112_omniavatar_worker_leases.down.sql",
		"111_omniavatar_pipeline_jobs.down.sql",
	} {
		contents, readErr := os.ReadFile(migrationPath(t, migration))
		require.NoError(t, readErr)
		_, execErr := pool.Exec(ctx, string(contents))
		require.NoError(t, execErr)
	}
	var jobsTable *string
	require.NoError(t, pool.QueryRow(ctx, `SELECT to_regclass('omniavatar_jobs')::text`).Scan(&jobsTable))
	require.Nil(t, jobsTable)
}

func migrationPath(t *testing.T, filename string) string {
	t.Helper()
	_, currentFile, _, ok := runtime.Caller(0)
	require.True(t, ok)
	return filepath.Join(filepath.Dir(currentFile), "..", "..", "database", "migrations", filename)
}

func testEvidence(jobID string) *pipeline.Evidence {
	prefix := "omniavatar/jobs/" + jobID + "/validating_image/"
	return &pipeline.Evidence{
		ArtifactKind:      "validated-image",
		ArtifactKey:       prefix + "source.png",
		ArtifactSHA256:    strings.Repeat("a", 64),
		ArtifactMediaType: "image/png",
		ArtifactBytes:     1,
		ReportKey:         prefix + "report.json",
		ReportSHA256:      strings.Repeat("b", 64),
		ReportMediaType:   "application/json",
		ReportBytes:       2,
		CreatedAt:         time.Now().UTC().Add(-time.Second),
	}
}

func testStageEvidence(jobID, stage string, createdAt time.Time) *pipeline.Evidence {
	prefix := "omniavatar/jobs/" + jobID + "/" + stage + "/"
	return &pipeline.Evidence{
		ArtifactKind: stage, ArtifactKey: prefix + "artifact.bin", ArtifactSHA256: strings.Repeat("a", 64),
		ArtifactMediaType: "application/octet-stream", ArtifactBytes: 1,
		ReportKey: prefix + "report.json", ReportSHA256: strings.Repeat("b", 64),
		ReportMediaType: "application/json", ReportBytes: 2, CreatedAt: createdAt,
	}
}

func testReferenceSet(job *pipeline.Job) pipeline.ReferenceSet {
	roles := []pipeline.ViewRole{
		pipeline.ViewFront, pipeline.ViewBack, pipeline.ViewLeftProfile, pipeline.ViewRightProfile,
		pipeline.ViewFrontThreeQuarter, pipeline.ViewRearThreeQuarter,
	}
	views := make([]pipeline.ReferenceView, 0, len(roles))
	for index, role := range roles {
		views = append(views, pipeline.ReferenceView{
			Role: role, StorageKey: "omniavatar/jobs/" + job.ID + "/references/" + string(role) + ".png",
			SHA256: strings.Repeat(string(rune('1'+index)), 64), MIMEType: "image/png",
			Width: 1024, Height: 1024, Pose: "t_pose", Expression: "neutral", FullBodyVisible: true,
		})
	}
	return pipeline.ReferenceSet{
		JobID: job.ID, OwnerID: job.OwnerID,
		AuthorityImageKey: "omniavatar/jobs/" + job.ID + "/authority/source.png", AuthorityImageSHA256: strings.Repeat("a", 64),
		Views: views, ConsistencyReportKey: "omniavatar/jobs/" + job.ID + "/references/consistency.json",
		ConsistencyReportSHA256: strings.Repeat("b", 64),
	}
}

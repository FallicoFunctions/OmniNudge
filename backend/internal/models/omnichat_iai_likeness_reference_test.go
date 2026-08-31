package models_test

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

func runningReferenceJob(t *testing.T, ctx context.Context, db *database.Database,
	repo *models.OmniChatMediaRepository, ownerID, personaID, nth int) *models.OmniChatGenerationJob {
	t.Helper()
	normalized, err := services.NormalizeOmniChatReferenceRequest(models.OmniChatGenerationRequest{
		Kind:      models.OmniChatMediaKindImage,
		PersonaID: personaID,
		Prompt:    fmt.Sprintf("Reference image of one person. Variant %d.", nth),
	}, services.IAIReferenceVariantKeys()[nth%len(services.IAIReferenceVariantKeys())])
	require.NoError(t, err)
	job, err := repo.CreateGenerationJob(ctx, ownerID, normalized, "test")
	require.NoError(t, err)
	marked, err := repo.MarkGenerationJobRunning(ctx, job.ID, fmt.Sprintf("ref-%d", nth))
	require.NoError(t, err)
	require.True(t, marked)
	_ = db
	return job
}

func referencesOf(t *testing.T, ctx context.Context, db *database.Database, personaID int) []string {
	t.Helper()
	var extensions []byte
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT extensions_json FROM bot_personas WHERE id = $1`, personaID).Scan(&extensions))
	var blob struct {
		Media models.OmniChatMediaIdentityProfile `json:"omnichat_media"`
	}
	require.NoError(t, json.Unmarshal(extensions, &blob))
	return blob.Media.ReferenceURLs
}

func TestASupportingReferenceIsNeitherChosenNorOwned(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	job := runningReferenceJob(t, ctx, db, repo, ownerID, personaID, 1)
	media := likenessMediaFor(ownerID, job)
	require.NoError(t, repo.AttachLikenessReference(ctx, job.ID, media,
		1<<30, 50<<30, models.OmniChatGenerationProvenance{}))

	// Nobody chooses it and nobody is shown it: no candidate row, no asset.
	var candidates, assets int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_iai_likeness_candidates WHERE generation_job_id = $1`,
		job.ID).Scan(&candidates))
	require.Zero(t, candidates)
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_assets WHERE generation_job_id = $1`, job.ID).Scan(&assets))
	require.Zero(t, assets)

	// Its whole life is one entry in what renders are conditioned on.
	require.Equal(t, []string{media.StorageURL}, referencesOf(t, ctx, db, personaID))
}

func TestTheAnchorIsNeverPushedOutByItsOwnSupport(t *testing.T) {
	// The list is mean-pooled, so overrunning it would dilute the picture
	// somebody actually chose out of the character's own identity.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	candidates := fourCandidates(t, ctx, db, repo, ownerID, personaID)
	anchor := candidates[0]
	_, err := repo.PickLikeness(ctx, personaID, ownerID, anchor.ID)
	require.NoError(t, err)

	limit := models.DefaultOmniChatMediaIdentityProfile().ReferenceLimit
	for nth := 1; nth <= limit+3; nth++ {
		job := runningReferenceJob(t, ctx, db, repo, ownerID, personaID, nth)
		require.NoError(t, repo.AttachLikenessReference(ctx, job.ID, likenessMediaFor(ownerID, job),
			1<<30, 50<<30, models.OmniChatGenerationProvenance{}))
	}

	references := referencesOf(t, ctx, db, personaID)
	require.Len(t, references, limit)
	require.Equal(t, anchor.StorageURL, references[0], "the picture somebody chose stays first")
}

func TestFiveReferencesLandingAtOnceAllArrive(t *testing.T) {
	// They render independently and finish in any order, and appending to her
	// reference list is a read-modify-write.
	//
	// This asserts the outcome, not the mechanism: removing the identity row
	// lock does not reproduce a loss, because the storage quota check already
	// takes a row lock on the owner and all five share one. The lock stays
	// anyway -- the invariant belongs to this row rather than to an incidental
	// side effect of counting storage -- but a passing test here is not
	// evidence that it is load-bearing.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	jobs := make([]*models.OmniChatGenerationJob, 0, 5)
	for nth := 1; nth <= 5; nth++ {
		jobs = append(jobs, runningReferenceJob(t, ctx, db, repo, ownerID, personaID, nth))
	}

	var wg sync.WaitGroup
	errs := make([]error, len(jobs))
	start := make(chan struct{})
	for i, job := range jobs {
		wg.Add(1)
		go func(n int, j *models.OmniChatGenerationJob) {
			defer wg.Done()
			<-start
			errs[n] = repo.AttachLikenessReference(ctx, j.ID, likenessMediaFor(ownerID, j),
				1<<30, 50<<30, models.OmniChatGenerationProvenance{})
		}(i, job)
	}
	close(start)
	wg.Wait()

	for i, err := range errs {
		require.NoError(t, err, "reference %d", i)
	}
	require.Len(t, referencesOf(t, ctx, db, personaID), 5, "none of them overwrote another")
}

func TestARetryDoesNotSpendATwiceOnTheSamePicture(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	job := runningReferenceJob(t, ctx, db, repo, ownerID, personaID, 1)
	media := likenessMediaFor(ownerID, job)
	require.NoError(t, repo.AttachLikenessReference(ctx, job.ID, media,
		1<<30, 50<<30, models.OmniChatGenerationProvenance{}))

	// The job is finished, so a second attach is refused outright -- but the
	// duplicate guard is what protects the list if one ever gets through.
	err := repo.AttachLikenessReference(ctx, job.ID, media,
		1<<30, 50<<30, models.OmniChatGenerationProvenance{})
	require.Error(t, err)
	require.Len(t, referencesOf(t, ctx, db, personaID), 1)
}

func TestALikenessCannotBeStoredAsAReference(t *testing.T) {
	// They are told apart by the job row, so the wrong path has to be refused
	// rather than quietly storing a candidate where nobody will ever see it.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	job := runningLikenessJob(t, ctx, db, repo, ownerID, personaID, 1)
	err := repo.AttachLikenessReference(ctx, job.ID, likenessMediaFor(ownerID, job),
		1<<30, 50<<30, models.OmniChatGenerationProvenance{})
	require.Error(t, err)
	require.Contains(t, err.Error(), "not a likeness reference")
	require.Empty(t, referencesOf(t, ctx, db, personaID))
}

package repository

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/omniavatar/pipeline"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

var _ pipeline.Repository = (*PostgresRepository)(nil)
var _ pipeline.WorkerRepository = (*PostgresRepository)(nil)
var _ pipeline.ProviderDispatchRepository = (*PostgresRepository)(nil)

func NewPostgresRepository(pool *pgxpool.Pool) (*PostgresRepository, error) {
	if pool == nil {
		return nil, errors.New("PostgreSQL pool is required")
	}
	return &PostgresRepository{pool: pool}, nil
}

func (r *PostgresRepository) Create(ctx context.Context, job *pipeline.Job, idempotencyKey string) (*pipeline.Job, bool, error) {
	if job == nil {
		return nil, false, errors.New("avatar pipeline job is required")
	}
	if err := job.ValidateSnapshot(); err != nil {
		return nil, false, err
	}
	if err := pipeline.ValidateIdempotencyKey(idempotencyKey); err != nil {
		return nil, false, err
	}

	var insertedID string
	err := r.pool.QueryRow(ctx, `
		INSERT INTO omniavatar_jobs (
			id, owner_id, state, resume_state, retry_count, max_retries,
			version, failure_reason, idempotency_key, created_at, updated_at
		) VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, NULLIF($8, ''), $9, $10, $11)
		ON CONFLICT DO NOTHING
		RETURNING id
	`, job.ID, job.OwnerID, job.State, job.ResumeState, job.RetryCount, job.MaxRetries,
		job.Version, job.FailureReason, idempotencyKey, job.CreatedAt, job.UpdatedAt).Scan(&insertedID)
	if err == nil {
		return cloneJob(job), true, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, false, fmt.Errorf("create avatar job: %w", err)
	}

	existing, getErr := r.getByOwnerAndIdempotency(ctx, job.OwnerID, idempotencyKey)
	if getErr != nil {
		if errors.Is(getErr, pipeline.ErrJobNotFound) {
			return nil, false, pipeline.ErrJobVersionConflict
		}
		return nil, false, getErr
	}
	return existing, false, nil
}

func (r *PostgresRepository) GetOwned(ctx context.Context, jobID string, ownerID int) (*pipeline.Job, error) {
	if ownerID <= 0 || pipeline.ValidateJobID(jobID) != nil {
		return nil, pipeline.ErrJobNotFound
	}
	return r.get(ctx, `WHERE id = $1 AND owner_id = $2`, jobID, ownerID)
}

func (r *PostgresRepository) GetSystem(ctx context.Context, jobID string) (*pipeline.Job, error) {
	if pipeline.ValidateJobID(jobID) != nil {
		return nil, pipeline.ErrJobNotFound
	}
	return r.get(ctx, `WHERE id = $1`, jobID)
}

func (r *PostgresRepository) getByOwnerAndIdempotency(ctx context.Context, ownerID int, key string) (*pipeline.Job, error) {
	return r.get(ctx, `WHERE owner_id = $1 AND idempotency_key = $2`, ownerID, key)
}

func (r *PostgresRepository) get(ctx context.Context, where string, args ...any) (*pipeline.Job, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{
		IsoLevel:   pgx.RepeatableRead,
		AccessMode: pgx.ReadOnly,
	})
	if err != nil {
		return nil, fmt.Errorf("begin avatar job read: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	job, err := readJob(ctx, tx, where, args...)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit avatar job read: %w", err)
	}
	return job, nil
}

type jobQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func readJob(ctx context.Context, querier jobQuerier, where string, args ...any) (*pipeline.Job, error) {
	query := `
		SELECT id, owner_id, state, COALESCE(resume_state, ''), retry_count,
		       max_retries, version, COALESCE(failure_reason, ''), created_at, updated_at
		FROM omniavatar_jobs ` + where
	job := &pipeline.Job{}
	var state, resumeState string
	err := querier.QueryRow(ctx, query, args...).Scan(
		&job.ID, &job.OwnerID, &state, &resumeState, &job.RetryCount,
		&job.MaxRetries, &job.Version, &job.FailureReason, &job.CreatedAt, &job.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, pipeline.ErrJobNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("read avatar job: %w", err)
	}
	job.State = pipeline.State(state)
	job.ResumeState = pipeline.State(resumeState)

	rows, err := querier.Query(ctx, `
		SELECT from_state, to_state, COALESCE(reason_code, ''), evidence, occurred_at
		FROM omniavatar_job_events
		WHERE job_id = $1
		ORDER BY sequence ASC
	`, job.ID)
	if err != nil {
		return nil, fmt.Errorf("read avatar job events: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var event pipeline.Event
		var from, to string
		var evidenceJSON []byte
		if err := rows.Scan(&from, &to, &event.ReasonCode, &evidenceJSON, &event.OccurredAt); err != nil {
			return nil, fmt.Errorf("scan avatar job event: %w", err)
		}
		event.From = pipeline.State(from)
		event.To = pipeline.State(to)
		if len(evidenceJSON) > 0 && string(evidenceJSON) != "null" {
			var evidence pipeline.Evidence
			decoder := json.NewDecoder(bytes.NewReader(evidenceJSON))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&evidence); err != nil {
				return nil, fmt.Errorf("decode avatar job evidence: %w", err)
			}
			event.Evidence = &evidence
		}
		job.Events = append(job.Events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate avatar job events: %w", err)
	}
	rows.Close()
	if err := job.ValidateSnapshot(); err != nil {
		return nil, fmt.Errorf("invalid persisted avatar job: %w", err)
	}
	return job, nil
}

func (r *PostgresRepository) UpdateOwnedCancellation(ctx context.Context, job *pipeline.Job, expectedVersion int) error {
	if job == nil || job.State != pipeline.StateCancelled || len(job.Events) == 0 || job.Events[len(job.Events)-1].ReasonCode != "user_cancelled" {
		return errors.New("owner update must be a cancellation")
	}
	return r.update(ctx, job, expectedVersion, "", "", nil)
}

func (r *PostgresRepository) UpdateLeased(ctx context.Context, job *pipeline.Job, expectedVersion int, token, workerID string, now time.Time) error {
	if job == nil {
		return pipeline.ErrJobVersionConflict
	}
	if err := pipeline.ValidateLeaseIdentity(job.ID, token, workerID); err != nil {
		return err
	}
	if now.IsZero() {
		return errors.New("lease check time is required")
	}
	return r.update(ctx, job, expectedVersion, token, workerID, nil)
}

func (r *PostgresRepository) UpdateLeasedWithDispatch(ctx context.Context, job *pipeline.Job, expectedVersion int, token, workerID string, now time.Time, dispatch *pipeline.ProviderDispatch) error {
	if dispatch == nil || job == nil || dispatch.JobID != job.ID || dispatch.JobVersion != job.Version || dispatch.Request.OwnerID != job.OwnerID {
		return errors.New("provider dispatch does not match transitioned job")
	}
	if err := dispatch.Validate(); err != nil {
		return err
	}
	if err := pipeline.ValidateLeaseIdentity(job.ID, token, workerID); err != nil {
		return err
	}
	if now.IsZero() {
		return errors.New("lease check time is required")
	}
	return r.update(ctx, job, expectedVersion, token, workerID, dispatch)
}

func (r *PostgresRepository) update(ctx context.Context, job *pipeline.Job, expectedVersion int, token, workerID string, dispatch *pipeline.ProviderDispatch) error {
	if job == nil || expectedVersion < 1 || job.Version != expectedVersion+1 || len(job.Events) == 0 || len(job.Events) != job.Version-1 {
		return pipeline.ErrJobVersionConflict
	}
	if err := job.ValidateSnapshot(); err != nil {
		return err
	}
	event := job.Events[len(job.Events)-1]
	var evidenceJSON any
	if event.Evidence != nil {
		encoded, err := json.Marshal(event.Evidence)
		if err != nil {
			return fmt.Errorf("encode avatar job evidence: %w", err)
		}
		evidenceJSON = string(encoded)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin avatar job update: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	current, err := readJob(ctx, tx, `WHERE id = $1 FOR UPDATE`, job.ID)
	if err != nil {
		if token != "" && errors.Is(err, pipeline.ErrJobNotFound) {
			return pipeline.ErrLeaseLost
		}
		return err
	}
	if current.OwnerID != job.OwnerID {
		if token != "" {
			return pipeline.ErrLeaseLost
		}
		return pipeline.ErrJobNotFound
	}
	if current.Version != expectedVersion {
		if token != "" {
			return pipeline.ErrLeaseLost
		}
		return pipeline.ErrJobVersionConflict
	}
	if err := pipeline.ValidateJobExtension(current, job, expectedVersion); err != nil {
		return err
	}
	var result pgconnCommandTag
	if token == "" {
		result, err = tx.Exec(ctx, `
			UPDATE omniavatar_jobs
			SET state = $1, resume_state = NULLIF($2, ''), retry_count = $3,
			    version = $4, failure_reason = NULLIF($5, ''), updated_at = $6,
			    lease_token = NULL, leased_by = NULL, lease_expires_at = NULL
			WHERE id = $7 AND owner_id = $8 AND version = $9
		`, job.State, job.ResumeState, job.RetryCount, job.Version, job.FailureReason,
			job.UpdatedAt, job.ID, job.OwnerID, expectedVersion)
	} else {
		result, err = tx.Exec(ctx, `
			UPDATE omniavatar_jobs
			SET state = $1, resume_state = NULLIF($2, ''), retry_count = $3,
			    version = $4, failure_reason = NULLIF($5, ''), updated_at = $6,
			    lease_token = NULL, leased_by = NULL, lease_expires_at = NULL
			WHERE id = $7 AND owner_id = $8 AND version = $9
			  AND lease_token = $10 AND leased_by = $11 AND lease_expires_at > CURRENT_TIMESTAMP
		`, job.State, job.ResumeState, job.RetryCount, job.Version, job.FailureReason,
			job.UpdatedAt, job.ID, job.OwnerID, expectedVersion, token, workerID)
	}
	if err != nil {
		return fmt.Errorf("update avatar job: %w", err)
	}
	if result.RowsAffected() != 1 {
		if token != "" {
			return pipeline.ErrLeaseLost
		}
		return pipeline.ErrJobVersionConflict
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO omniavatar_job_events (
			job_id, sequence, from_state, to_state, reason_code, evidence, occurred_at
		) VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6::jsonb, $7)
	`, job.ID, job.Version-1, event.From, event.To, event.ReasonCode, evidenceJSON, event.OccurredAt)
	if err != nil {
		return fmt.Errorf("append avatar job event: %w", err)
	}
	if dispatch != nil {
		requestJSON, marshalErr := json.Marshal(dispatch.Request)
		if marshalErr != nil {
			return fmt.Errorf("encode provider dispatch request: %w", marshalErr)
		}
		inserted, insertErr := tx.Exec(ctx, `
			INSERT INTO omniavatar_provider_dispatches (
				id, job_id, job_version, provider, request, status, attempt,
				available_at, created_at, updated_at
			)
			SELECT $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10
			FROM omniavatar_jobs
			WHERE id = $2 AND owner_id = ($5::jsonb->>'ownerId')::bigint
			  AND state = 'reconstructing' AND version = $3
		`, dispatch.ID, dispatch.JobID, dispatch.JobVersion, dispatch.Provider,
			string(requestJSON), dispatch.Status, dispatch.Attempt, dispatch.AvailableAt,
			dispatch.CreatedAt, dispatch.UpdatedAt)
		if insertErr != nil {
			return fmt.Errorf("append provider dispatch: %w", insertErr)
		}
		if inserted.RowsAffected() != 1 {
			return errors.New("append provider dispatch: transitioned job ownership or version mismatch")
		}
	}
	if token == "" && job.State == pipeline.StateCancelled {
		_, err = tx.Exec(ctx, `
			UPDATE omniavatar_provider_dispatches
			SET status = 'cancelled', lease_token = NULL, leased_by = NULL,
			    lease_expires_at = NULL, updated_at = $2
			WHERE job_id = $1 AND status = 'pending'
		`, job.ID, job.UpdatedAt)
		if err != nil {
			return fmt.Errorf("cancel pending provider dispatch: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit avatar job update: %w", err)
	}
	return nil
}

// pgx.CommandTag is kept behind this local shape so the update logic remains
// easy to test without exposing the concrete pgconn type.
type pgconnCommandTag interface {
	RowsAffected() int64
}

func (r *PostgresRepository) ClaimNext(ctx context.Context, workerID string, now time.Time, duration time.Duration) (*pipeline.Lease, error) {
	if err := pipeline.ValidateLeaseRequest(workerID, now, duration); err != nil {
		return nil, err
	}
	token := uuid.NewString()
	var expiresAt time.Time
	var jobID string
	var attempt int
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin avatar job claim: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	err = tx.QueryRow(ctx, `
		WITH candidate AS (
			SELECT id
			FROM omniavatar_jobs
			WHERE state NOT IN ('published', 'manual_review', 'cancelled')
			  AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)
			ORDER BY COALESCE(last_claimed_at, created_at) ASC, id ASC
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		UPDATE omniavatar_jobs AS job
		SET lease_token = $1, leased_by = $2,
		    lease_expires_at = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 second'),
		    last_claimed_at = CURRENT_TIMESTAMP,
		    lease_attempt = lease_attempt + 1
		FROM candidate
		WHERE job.id = candidate.id
		RETURNING job.id, job.lease_attempt, job.lease_expires_at
	`, token, workerID, duration.Seconds()).Scan(&jobID, &attempt, &expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, pipeline.ErrNoClaimableJobs
	}
	if err != nil {
		return nil, fmt.Errorf("claim avatar job: %w", err)
	}
	job, err := readJob(ctx, tx, `WHERE id = $1`, jobID)
	if err != nil {
		return nil, fmt.Errorf("read claimed avatar job: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit avatar job claim: %w", err)
	}
	return &pipeline.Lease{
		Job:       job,
		Token:     token,
		WorkerID:  workerID,
		Attempt:   attempt,
		ExpiresAt: expiresAt,
	}, nil
}

func (r *PostgresRepository) RenewLease(ctx context.Context, jobID, token, workerID string, now time.Time, duration time.Duration) (time.Time, error) {
	if err := pipeline.ValidateLeaseRequest(workerID, now, duration); err != nil {
		return time.Time{}, err
	}
	if err := pipeline.ValidateLeaseIdentity(jobID, token, workerID); err != nil {
		return time.Time{}, err
	}
	var expiresAt time.Time
	err := r.pool.QueryRow(ctx, `
		UPDATE omniavatar_jobs
		SET lease_expires_at = GREATEST(
			lease_expires_at,
			CURRENT_TIMESTAMP + ($1 * INTERVAL '1 second')
		)
		WHERE id = $2 AND lease_token = $3 AND leased_by = $4
		  AND lease_expires_at > CURRENT_TIMESTAMP
		RETURNING lease_expires_at
	`, duration.Seconds(), jobID, token, workerID).Scan(&expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return time.Time{}, pipeline.ErrLeaseLost
	}
	if err != nil {
		return time.Time{}, fmt.Errorf("renew avatar job lease: %w", err)
	}
	return expiresAt, nil
}

func (r *PostgresRepository) ReleaseLease(ctx context.Context, jobID, token, workerID string) error {
	if err := pipeline.ValidateLeaseIdentity(jobID, token, workerID); err != nil {
		return err
	}
	result, err := r.pool.Exec(ctx, `
		UPDATE omniavatar_jobs
		SET lease_token = NULL, leased_by = NULL, lease_expires_at = NULL
		WHERE id = $1 AND lease_token = $2 AND leased_by = $3
	`, jobID, token, workerID)
	if err != nil {
		return fmt.Errorf("release avatar job lease: %w", err)
	}
	if result.RowsAffected() != 1 {
		return pipeline.ErrLeaseLost
	}
	return nil
}

func cloneJob(job *pipeline.Job) *pipeline.Job {
	copy := *job
	copy.Events = make([]pipeline.Event, len(job.Events))
	for index, event := range job.Events {
		copy.Events[index] = event
		if event.Evidence != nil {
			evidence := *event.Evidence
			copy.Events[index].Evidence = &evidence
		}
	}
	return &copy
}

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
	"github.com/omninudge/backend/internal/omniavatar/pipeline"
)

type rowScanner interface {
	Scan(...any) error
}

const dispatchColumns = `
	id, job_id, job_version, provider, request, status, provider_task,
	attempt, COALESCE(last_error_code, ''), available_at, created_at, updated_at`

const qualifiedDispatchColumns = `
	dispatch.id, dispatch.job_id, dispatch.job_version, dispatch.provider,
	dispatch.request, dispatch.status, dispatch.provider_task, dispatch.attempt,
	COALESCE(dispatch.last_error_code, ''), dispatch.available_at,
	dispatch.created_at, dispatch.updated_at`

func scanDispatch(row rowScanner) (*pipeline.ProviderDispatch, error) {
	dispatch := &pipeline.ProviderDispatch{}
	var requestJSON, taskJSON []byte
	var status string
	if err := row.Scan(
		&dispatch.ID, &dispatch.JobID, &dispatch.JobVersion, &dispatch.Provider,
		&requestJSON, &status, &taskJSON, &dispatch.Attempt, &dispatch.LastErrorCode,
		&dispatch.AvailableAt, &dispatch.CreatedAt, &dispatch.UpdatedAt,
	); err != nil {
		return nil, err
	}
	dispatch.Status = pipeline.DispatchStatus(status)
	decoder := json.NewDecoder(bytes.NewReader(requestJSON))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&dispatch.Request); err != nil {
		return nil, fmt.Errorf("decode provider dispatch request: %w", err)
	}
	if len(taskJSON) > 0 && string(taskJSON) != "null" {
		var task pipeline.ProviderTask
		decoder = json.NewDecoder(bytes.NewReader(taskJSON))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&task); err != nil {
			return nil, fmt.Errorf("decode provider task: %w", err)
		}
		dispatch.Task = &task
	}
	if err := dispatch.Validate(); err != nil {
		return nil, fmt.Errorf("invalid persisted provider dispatch: %w", err)
	}
	return dispatch, nil
}

func (r *PostgresRepository) ClaimNextDispatch(ctx context.Context, workerID string, now time.Time, duration time.Duration) (*pipeline.DispatchLease, error) {
	if err := pipeline.ValidateLeaseRequest(workerID, now, duration); err != nil {
		return nil, err
	}
	token := uuid.NewString()
	var expiresAt time.Time
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin provider dispatch claim: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	row := tx.QueryRow(ctx, `
		WITH candidate AS (
			SELECT dispatch.id
			FROM omniavatar_provider_dispatches AS dispatch
			JOIN omniavatar_jobs AS job ON job.id = dispatch.job_id
			WHERE dispatch.status = 'pending' AND dispatch.attempt < 5
			  AND dispatch.available_at <= CURRENT_TIMESTAMP
			  AND (dispatch.lease_expires_at IS NULL OR dispatch.lease_expires_at <= CURRENT_TIMESTAMP)
			  AND job.state = 'reconstructing'
			ORDER BY dispatch.available_at ASC, dispatch.created_at ASC, dispatch.id ASC
			FOR UPDATE OF dispatch SKIP LOCKED
			LIMIT 1
		)
		UPDATE omniavatar_provider_dispatches AS dispatch
		SET lease_token = $1, leased_by = $2,
		    lease_expires_at = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 second'),
		    updated_at = CURRENT_TIMESTAMP
		FROM candidate
		WHERE dispatch.id = candidate.id
		RETURNING `+qualifiedDispatchColumns+`, dispatch.lease_expires_at
	`, token, workerID, duration.Seconds())

	dispatch := &pipeline.ProviderDispatch{}
	var requestJSON, taskJSON []byte
	var status string
	err = row.Scan(
		&dispatch.ID, &dispatch.JobID, &dispatch.JobVersion, &dispatch.Provider,
		&requestJSON, &status, &taskJSON, &dispatch.Attempt, &dispatch.LastErrorCode,
		&dispatch.AvailableAt, &dispatch.CreatedAt, &dispatch.UpdatedAt, &expiresAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, pipeline.ErrNoClaimableDispatches
	}
	if err != nil {
		return nil, fmt.Errorf("claim provider dispatch: %w", err)
	}
	dispatch.Status = pipeline.DispatchStatus(status)
	decoder := json.NewDecoder(bytes.NewReader(requestJSON))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&dispatch.Request); err != nil {
		return nil, fmt.Errorf("decode claimed provider dispatch request: %w", err)
	}
	if len(taskJSON) > 0 && string(taskJSON) != "null" {
		return nil, errors.New("pending provider dispatch unexpectedly contains a task")
	}
	if err := dispatch.Validate(); err != nil {
		return nil, fmt.Errorf("invalid claimed provider dispatch: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit provider dispatch claim: %w", err)
	}
	return &pipeline.DispatchLease{Dispatch: dispatch, Token: token, WorkerID: workerID, ExpiresAt: expiresAt}, nil
}

func (r *PostgresRepository) MarkDispatchSubmitted(ctx context.Context, dispatchID, token, workerID string, now time.Time, task pipeline.ProviderTask) (*pipeline.ProviderDispatch, error) {
	if err := pipeline.ValidateLeaseIdentity(dispatchID, token, workerID); err != nil {
		return nil, err
	}
	if now.IsZero() {
		return nil, errors.New("dispatch completion time is required")
	}
	if err := task.Validate(); err != nil {
		return nil, err
	}
	taskJSON, err := json.Marshal(task)
	if err != nil {
		return nil, fmt.Errorf("encode provider task: %w", err)
	}
	query := `
		UPDATE omniavatar_provider_dispatches
		SET status = 'submitted', provider_task = $1::jsonb, last_error_code = NULL,
		    lease_token = NULL, leased_by = NULL, lease_expires_at = NULL,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $2 AND lease_token = $3 AND leased_by = $4
		  AND lease_expires_at > CURRENT_TIMESTAMP AND status = 'pending'
		  AND provider = $5 AND request->>'model' = $6
		RETURNING ` + dispatchColumns
	row := r.pool.QueryRow(ctx, query, string(taskJSON), dispatchID, token, workerID, task.Provider, task.Model)
	dispatch, err := scanDispatch(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, pipeline.ErrDispatchLeaseLost
	}
	if err != nil {
		return nil, fmt.Errorf("submit provider dispatch: %w", err)
	}
	return dispatch, nil
}

func (r *PostgresRepository) RecordDispatchFailure(ctx context.Context, dispatchID, token, workerID string, now, retryAt time.Time, reasonCode string) (*pipeline.ProviderDispatch, error) {
	if err := pipeline.ValidateLeaseIdentity(dispatchID, token, workerID); err != nil {
		return nil, err
	}
	if now.IsZero() || retryAt.Before(now) {
		return nil, errors.New("dispatch retry time must not precede failure time")
	}
	if err := pipeline.ValidateReasonCode(reasonCode); err != nil {
		return nil, err
	}
	query := `
		UPDATE omniavatar_provider_dispatches
		SET status = CASE WHEN attempt + 1 = 5 THEN 'failed' ELSE 'pending' END,
		    attempt = attempt + 1, last_error_code = $1, available_at = $2,
		    lease_token = NULL, leased_by = NULL, lease_expires_at = NULL,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $3 AND lease_token = $4 AND leased_by = $5
		  AND lease_expires_at > CURRENT_TIMESTAMP AND status = 'pending'
		RETURNING ` + dispatchColumns
	row := r.pool.QueryRow(ctx, query, reasonCode, retryAt, dispatchID, token, workerID)
	dispatch, err := scanDispatch(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, pipeline.ErrDispatchLeaseLost
	}
	if err != nil {
		return nil, fmt.Errorf("record provider dispatch failure: %w", err)
	}
	return dispatch, nil
}

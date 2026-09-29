package pipeline

import (
	"context"
	"errors"
	"sort"
	"strconv"
	"time"

	"github.com/google/uuid"
)

func dispatchJobVersionKey(jobID string, version int) string {
	return jobID + ":" + strconv.Itoa(version)
}

func (r *InMemoryRepository) UpdateLeasedWithDispatch(ctx context.Context, job *Job, expectedVersion int, token, workerID string, now time.Time, dispatch *ProviderDispatch) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if dispatch == nil || job == nil || dispatch.JobID != job.ID || dispatch.JobVersion != job.Version || dispatch.Request.OwnerID != job.OwnerID {
		return errors.New("provider dispatch does not match transitioned job")
	}
	if err := dispatch.Validate(); err != nil {
		return err
	}
	if err := ValidateLeaseIdentity(job.ID, token, workerID); err != nil {
		return err
	}
	if now.IsZero() {
		return errors.New("lease check time is required")
	}
	if err := job.ValidateSnapshot(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	current, ok := r.jobs[job.ID]
	lease, leased := r.leases[job.ID]
	if !ok || !leased || current.OwnerID != job.OwnerID || lease.token != token || lease.workerID != workerID || !lease.expiresAt.After(now) {
		return ErrLeaseLost
	}
	if current.Version != expectedVersion {
		return ErrJobVersionConflict
	}
	if err := ValidateJobExtension(current, job, expectedVersion); err != nil {
		return err
	}
	key := dispatchJobVersionKey(job.ID, job.Version)
	if _, exists := r.dispatchesByJobVersion[key]; exists {
		return ErrJobVersionConflict
	}
	if _, exists := r.dispatches[dispatch.ID]; exists {
		return ErrJobVersionConflict
	}
	r.jobs[job.ID] = cloneJob(job)
	r.dispatches[dispatch.ID] = cloneDispatch(dispatch)
	r.dispatchesByJobVersion[key] = dispatch.ID
	delete(r.leases, job.ID)
	return nil
}

func (r *InMemoryRepository) ClaimNextDispatch(ctx context.Context, workerID string, now time.Time, duration time.Duration) (*DispatchLease, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := ValidateLeaseRequest(workerID, now, duration); err != nil {
		return nil, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	ids := make([]string, 0, len(r.dispatches))
	for id, dispatch := range r.dispatches {
		lease, leased := r.dispatchLeases[id]
		job := r.jobs[dispatch.JobID]
		if dispatch.Status == DispatchPending && dispatch.Attempt < maxDispatchAttempts && !dispatch.AvailableAt.After(now) && job != nil && job.State == StateReconstructing && (!leased || !lease.expiresAt.After(now)) {
			ids = append(ids, id)
		}
	}
	sort.Slice(ids, func(i, j int) bool {
		left, right := r.dispatches[ids[i]], r.dispatches[ids[j]]
		if left.AvailableAt.Equal(right.AvailableAt) {
			if left.CreatedAt.Equal(right.CreatedAt) {
				return left.ID < right.ID
			}
			return left.CreatedAt.Before(right.CreatedAt)
		}
		return left.AvailableAt.Before(right.AvailableAt)
	})
	if len(ids) == 0 {
		return nil, ErrNoClaimableDispatches
	}
	id := ids[0]
	dispatch := r.dispatches[id]
	dispatch.UpdatedAt = now.UTC()
	lease := memoryLease{token: uuid.NewString(), workerID: workerID, attempt: dispatch.Attempt + 1, expiresAt: now.UTC().Add(duration)}
	r.dispatchLeases[id] = lease
	return &DispatchLease{Dispatch: cloneDispatch(dispatch), Token: lease.token, WorkerID: workerID, ExpiresAt: lease.expiresAt}, nil
}

func (r *InMemoryRepository) MarkDispatchSubmitted(ctx context.Context, dispatchID, token, workerID string, now time.Time, task ProviderTask) (*ProviderDispatch, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := ValidateLeaseIdentity(dispatchID, token, workerID); err != nil {
		return nil, err
	}
	if now.IsZero() {
		return nil, errors.New("dispatch completion time is required")
	}
	if err := task.Validate(); err != nil {
		return nil, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	dispatch, ok := r.dispatches[dispatchID]
	lease, leased := r.dispatchLeases[dispatchID]
	if !ok || !leased || dispatch.Status != DispatchPending || lease.token != token || lease.workerID != workerID || !lease.expiresAt.After(now) {
		return nil, ErrDispatchLeaseLost
	}
	if task.Provider != dispatch.Provider || task.Model != dispatch.Request.Model {
		return nil, errors.New("provider task does not match the immutable dispatch route")
	}
	dispatch.Task = &task
	dispatch.Status = DispatchSubmitted
	dispatch.LastErrorCode = ""
	dispatch.UpdatedAt = now.UTC()
	if err := dispatch.Validate(); err != nil {
		return nil, err
	}
	delete(r.dispatchLeases, dispatchID)
	return cloneDispatch(dispatch), nil
}

func (r *InMemoryRepository) RecordDispatchFailure(ctx context.Context, dispatchID, token, workerID string, now, retryAt time.Time, reasonCode string) (*ProviderDispatch, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := ValidateLeaseIdentity(dispatchID, token, workerID); err != nil {
		return nil, err
	}
	if now.IsZero() || retryAt.Before(now) {
		return nil, errors.New("dispatch retry time must not precede failure time")
	}
	if err := validateReasonCode(reasonCode); err != nil {
		return nil, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	dispatch, ok := r.dispatches[dispatchID]
	lease, leased := r.dispatchLeases[dispatchID]
	if !ok || !leased || dispatch.Status != DispatchPending || lease.token != token || lease.workerID != workerID || !lease.expiresAt.After(now) {
		return nil, ErrDispatchLeaseLost
	}
	dispatch.LastErrorCode = reasonCode
	dispatch.AvailableAt = retryAt.UTC()
	dispatch.UpdatedAt = now.UTC()
	dispatch.Attempt++
	if dispatch.Attempt == maxDispatchAttempts {
		dispatch.Status = DispatchFailed
	}
	if err := dispatch.Validate(); err != nil {
		return nil, err
	}
	delete(r.dispatchLeases, dispatchID)
	return cloneDispatch(dispatch), nil
}

func (s *Service) ClaimNextProviderDispatch(ctx context.Context, workerID string, duration time.Duration) (*DispatchLease, error) {
	repository, ok := s.repository.(ProviderDispatchRepository)
	if !ok {
		return nil, errors.New("avatar pipeline repository does not support provider dispatches")
	}
	return repository.ClaimNextDispatch(ctx, workerID, s.now(), duration)
}

func (s *Service) MarkProviderDispatchSubmitted(ctx context.Context, lease *DispatchLease, task ProviderTask) (*ProviderDispatch, error) {
	if lease == nil || lease.Dispatch == nil || lease.Token == "" {
		return nil, ErrDispatchLeaseLost
	}
	if err := task.Validate(); err != nil {
		return nil, err
	}
	if task.Provider != lease.Dispatch.Provider || task.Model != lease.Dispatch.Request.Model {
		return nil, errors.New("provider task does not match the immutable dispatch route")
	}
	repository, ok := s.repository.(ProviderDispatchRepository)
	if !ok {
		return nil, errors.New("avatar pipeline repository does not support provider dispatches")
	}
	dispatch, err := repository.MarkDispatchSubmitted(ctx, lease.Dispatch.ID, lease.Token, lease.WorkerID, s.now(), task)
	if err != nil {
		return nil, err
	}
	lease.Token = ""
	lease.ExpiresAt = time.Time{}
	lease.Dispatch = cloneDispatch(dispatch)
	return dispatch, nil
}

func (s *Service) RecordProviderDispatchFailure(ctx context.Context, lease *DispatchLease, retryAt time.Time, reasonCode string) (*ProviderDispatch, error) {
	if lease == nil || lease.Dispatch == nil || lease.Token == "" {
		return nil, ErrDispatchLeaseLost
	}
	repository, ok := s.repository.(ProviderDispatchRepository)
	if !ok {
		return nil, errors.New("avatar pipeline repository does not support provider dispatches")
	}
	dispatch, err := repository.RecordDispatchFailure(ctx, lease.Dispatch.ID, lease.Token, lease.WorkerID, s.now(), retryAt, reasonCode)
	if err != nil {
		return nil, err
	}
	lease.Token = ""
	lease.ExpiresAt = time.Time{}
	lease.Dispatch = cloneDispatch(dispatch)
	return dispatch, nil
}

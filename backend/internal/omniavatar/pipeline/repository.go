package pipeline

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
)

var (
	ErrJobNotFound        = errors.New("avatar pipeline job not found")
	ErrJobVersionConflict = errors.New("avatar pipeline job version conflict")
)

// Repository persists the state machine. Implementations must scope reads by
// owner and update the job row plus its newest event atomically.
type Repository interface {
	Create(ctx context.Context, job *Job, idempotencyKey string) (stored *Job, created bool, err error)
	GetOwned(ctx context.Context, jobID string, ownerID int) (*Job, error)
	GetSystem(ctx context.Context, jobID string) (*Job, error)
	UpdateOwnedCancellation(ctx context.Context, job *Job, expectedVersion int) error
}

// InMemoryRepository is the deterministic local/test implementation. It has
// the same ownership, idempotency, copy-on-read, and optimistic-lock behavior
// as the PostgreSQL adapter.
type InMemoryRepository struct {
	mu                     sync.RWMutex
	jobs                   map[string]*Job
	idempotency            map[int]map[string]string
	leases                 map[string]memoryLease
	attempts               map[string]int
	lastClaimed            map[string]time.Time
	dispatches             map[string]*ProviderDispatch
	dispatchesByJobVersion map[string]string
	dispatchLeases         map[string]memoryLease
}

type memoryLease struct {
	token     string
	workerID  string
	attempt   int
	expiresAt time.Time
}

func NewInMemoryRepository() *InMemoryRepository {
	return &InMemoryRepository{
		jobs:                   make(map[string]*Job),
		idempotency:            make(map[int]map[string]string),
		leases:                 make(map[string]memoryLease),
		attempts:               make(map[string]int),
		lastClaimed:            make(map[string]time.Time),
		dispatches:             make(map[string]*ProviderDispatch),
		dispatchesByJobVersion: make(map[string]string),
		dispatchLeases:         make(map[string]memoryLease),
	}
}

func (r *InMemoryRepository) Create(ctx context.Context, job *Job, idempotencyKey string) (*Job, bool, error) {
	if err := ctx.Err(); err != nil {
		return nil, false, err
	}
	if job == nil || job.OwnerID <= 0 || job.ID == "" {
		return nil, false, errors.New("valid avatar pipeline job is required")
	}
	if err := job.ValidateSnapshot(); err != nil {
		return nil, false, err
	}
	if err := ValidateIdempotencyKey(idempotencyKey); err != nil {
		return nil, false, err
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	ownerKeys := r.idempotency[job.OwnerID]
	if ownerKeys == nil {
		ownerKeys = make(map[string]string)
		r.idempotency[job.OwnerID] = ownerKeys
	}
	if existingID, ok := ownerKeys[idempotencyKey]; ok {
		existing, exists := r.jobs[existingID]
		if !exists {
			return nil, false, errors.New("avatar pipeline idempotency index references a missing job")
		}
		return cloneJob(existing), false, nil
	}
	if _, exists := r.jobs[job.ID]; exists {
		return nil, false, ErrJobVersionConflict
	}
	r.jobs[job.ID] = cloneJob(job)
	ownerKeys[idempotencyKey] = job.ID
	return cloneJob(job), true, nil
}

func (r *InMemoryRepository) GetOwned(ctx context.Context, jobID string, ownerID int) (*Job, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if ownerID <= 0 || ValidateJobID(jobID) != nil {
		return nil, ErrJobNotFound
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	job, ok := r.jobs[jobID]
	if !ok || job.OwnerID != ownerID {
		return nil, ErrJobNotFound
	}
	return cloneJob(job), nil
}

func (r *InMemoryRepository) GetSystem(ctx context.Context, jobID string) (*Job, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if ValidateJobID(jobID) != nil {
		return nil, ErrJobNotFound
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	job, ok := r.jobs[jobID]
	if !ok {
		return nil, ErrJobNotFound
	}
	return cloneJob(job), nil
}

func (r *InMemoryRepository) UpdateOwnedCancellation(ctx context.Context, job *Job, expectedVersion int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if job == nil || expectedVersion < 1 || job.Version != expectedVersion+1 || len(job.Events) == 0 || len(job.Events) != job.Version-1 {
		return ErrJobVersionConflict
	}
	if err := job.ValidateSnapshot(); err != nil {
		return err
	}
	if !isOwnerCancellation(job) {
		return errors.New("owner update must be a cancellation")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	current, ok := r.jobs[job.ID]
	if !ok || current.OwnerID != job.OwnerID {
		return ErrJobNotFound
	}
	if current.Version != expectedVersion {
		return ErrJobVersionConflict
	}
	if err := ValidateJobExtension(current, job, expectedVersion); err != nil {
		return err
	}
	r.jobs[job.ID] = cloneJob(job)
	delete(r.leases, job.ID)
	for id, dispatch := range r.dispatches {
		if dispatch.JobID == job.ID && dispatch.Status == DispatchPending {
			dispatch.Status = DispatchCancelled
			dispatch.UpdatedAt = job.UpdatedAt
			delete(r.dispatchLeases, id)
		}
	}
	return nil
}

func isOwnerCancellation(job *Job) bool {
	if job == nil || len(job.Events) == 0 || job.State != StateCancelled {
		return false
	}
	event := job.Events[len(job.Events)-1]
	return event.To == StateCancelled && event.ReasonCode == "user_cancelled"
}

func (r *InMemoryRepository) ClaimNext(ctx context.Context, workerID string, now time.Time, duration time.Duration) (*Lease, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := ValidateLeaseRequest(workerID, now, duration); err != nil {
		return nil, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	jobIDs := make([]string, 0, len(r.jobs))
	for jobID, job := range r.jobs {
		lease, leased := r.leases[jobID]
		if !job.IsTerminal() && (!leased || !lease.expiresAt.After(now)) {
			jobIDs = append(jobIDs, jobID)
		}
	}
	sort.Slice(jobIDs, func(left, right int) bool {
		leftJob, rightJob := r.jobs[jobIDs[left]], r.jobs[jobIDs[right]]
		leftOrder, rightOrder := r.lastClaimed[leftJob.ID], r.lastClaimed[rightJob.ID]
		if leftOrder.IsZero() {
			leftOrder = leftJob.CreatedAt
		}
		if rightOrder.IsZero() {
			rightOrder = rightJob.CreatedAt
		}
		if leftOrder.Equal(rightOrder) {
			return leftJob.ID < rightJob.ID
		}
		return leftOrder.Before(rightOrder)
	})
	if len(jobIDs) == 0 {
		return nil, ErrNoClaimableJobs
	}
	jobID := jobIDs[0]
	r.attempts[jobID]++
	r.lastClaimed[jobID] = now.UTC()
	lease := memoryLease{
		token:     uuid.NewString(),
		workerID:  workerID,
		attempt:   r.attempts[jobID],
		expiresAt: now.UTC().Add(duration),
	}
	r.leases[jobID] = lease
	return &Lease{
		Job:       cloneJob(r.jobs[jobID]),
		Token:     lease.token,
		WorkerID:  lease.workerID,
		Attempt:   lease.attempt,
		ExpiresAt: lease.expiresAt,
	}, nil
}

func (r *InMemoryRepository) RenewLease(ctx context.Context, jobID, token, workerID string, now time.Time, duration time.Duration) (time.Time, error) {
	if err := ctx.Err(); err != nil {
		return time.Time{}, err
	}
	if err := ValidateLeaseRequest(workerID, now, duration); err != nil {
		return time.Time{}, err
	}
	if err := ValidateLeaseIdentity(jobID, token, workerID); err != nil {
		return time.Time{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	lease, ok := r.leases[jobID]
	if !ok || lease.token != token || lease.workerID != workerID || !lease.expiresAt.After(now) {
		return time.Time{}, ErrLeaseLost
	}
	requestedExpiry := now.UTC().Add(duration)
	if requestedExpiry.After(lease.expiresAt) {
		lease.expiresAt = requestedExpiry
	}
	r.leases[jobID] = lease
	return lease.expiresAt, nil
}

func (r *InMemoryRepository) UpdateLeased(ctx context.Context, job *Job, expectedVersion int, token, workerID string, now time.Time) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if job == nil || expectedVersion < 1 || job.Version != expectedVersion+1 || len(job.Events) == 0 || len(job.Events) != job.Version-1 {
		return ErrJobVersionConflict
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
	r.jobs[job.ID] = cloneJob(job)
	delete(r.leases, job.ID)
	return nil
}

// ValidateJobExtension proves that an update preserves all persisted history
// and immutable job metadata while appending exactly one new event.
func ValidateJobExtension(previous, next *Job, expectedVersion int) error {
	if previous == nil || next == nil || previous.Version != expectedVersion || next.Version != expectedVersion+1 {
		return ErrJobVersionConflict
	}
	if previous.ID != next.ID || previous.OwnerID != next.OwnerID || previous.MaxRetries != next.MaxRetries || !previous.CreatedAt.Equal(next.CreatedAt) {
		return fmt.Errorf("%w: immutable job metadata changed", ErrJobVersionConflict)
	}
	if len(next.Events) != len(previous.Events)+1 {
		return fmt.Errorf("%w: update must append exactly one event", ErrJobVersionConflict)
	}
	for index := range previous.Events {
		if !eventsEqual(previous.Events[index], next.Events[index]) {
			return fmt.Errorf("%w: persisted event %d changed", ErrJobVersionConflict, index+1)
		}
	}
	if next.Events[len(next.Events)-1].From != previous.State {
		return fmt.Errorf("%w: newest event does not extend stored state", ErrJobVersionConflict)
	}
	return nil
}

func eventsEqual(left, right Event) bool {
	return left.From == right.From && left.To == right.To && left.ReasonCode == right.ReasonCode &&
		left.OccurredAt.Equal(right.OccurredAt) && evidenceEqual(left.Evidence, right.Evidence)
}

func evidenceEqual(left, right *Evidence) bool {
	if left == nil || right == nil {
		return left == right
	}
	return left.ArtifactKind == right.ArtifactKind && left.ArtifactKey == right.ArtifactKey &&
		left.ArtifactSHA256 == right.ArtifactSHA256 && left.ArtifactMediaType == right.ArtifactMediaType &&
		left.ArtifactBytes == right.ArtifactBytes && left.ReportKey == right.ReportKey &&
		left.ReportSHA256 == right.ReportSHA256 && left.ReportMediaType == right.ReportMediaType &&
		left.ReportBytes == right.ReportBytes && left.CreatedAt.Equal(right.CreatedAt)
}

func (r *InMemoryRepository) ReleaseLease(ctx context.Context, jobID, token, workerID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := ValidateLeaseIdentity(jobID, token, workerID); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	lease, ok := r.leases[jobID]
	if !ok || lease.token != token || lease.workerID != workerID {
		return ErrLeaseLost
	}
	delete(r.leases, jobID)
	return nil
}

func cloneJob(job *Job) *Job {
	if job == nil {
		return nil
	}
	copy := *job
	copy.Events = make([]Event, len(job.Events))
	for index, event := range job.Events {
		copy.Events[index] = event
		copy.Events[index].Evidence = cloneEvidence(event.Evidence)
	}
	return &copy
}

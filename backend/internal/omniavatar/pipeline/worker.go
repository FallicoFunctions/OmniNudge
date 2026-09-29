package pipeline

import (
	"context"
	"errors"
	"fmt"
	"time"
)

var (
	ErrNoClaimableJobs = errors.New("no avatar pipeline jobs are claimable")
	ErrLeaseLost       = errors.New("avatar pipeline worker lease was lost")
)

const (
	minLeaseDuration = 15 * time.Second
	maxLeaseDuration = 15 * time.Minute
)

type Lease struct {
	Job       *Job
	Token     string
	WorkerID  string
	Attempt   int
	ExpiresAt time.Time
}

type WorkerRepository interface {
	Repository
	ClaimNext(ctx context.Context, workerID string, now time.Time, duration time.Duration) (*Lease, error)
	RenewLease(ctx context.Context, jobID, token, workerID string, now time.Time, duration time.Duration) (time.Time, error)
	UpdateLeased(ctx context.Context, job *Job, expectedVersion int, token, workerID string, now time.Time) error
	ReleaseLease(ctx context.Context, jobID, token, workerID string) error
}

func ValidateLeaseRequest(workerID string, now time.Time, duration time.Duration) error {
	if !providerIdentifierPattern.MatchString(workerID) {
		return errors.New("worker ID must contain 1 to 128 safe characters")
	}
	if now.IsZero() {
		return errors.New("lease time is required")
	}
	if duration < minLeaseDuration || duration > maxLeaseDuration {
		return fmt.Errorf("lease duration must be between %s and %s", minLeaseDuration, maxLeaseDuration)
	}
	return nil
}

func ValidateLeaseIdentity(jobID, token, workerID string) error {
	if err := validateCanonicalUUID("lease job", jobID); err != nil {
		return err
	}
	if err := validateCanonicalUUID("lease token", token); err != nil {
		return err
	}
	if !providerIdentifierPattern.MatchString(workerID) {
		return errors.New("worker ID must contain 1 to 128 safe characters")
	}
	return nil
}

func (s *Service) ClaimNextJob(ctx context.Context, workerID string, duration time.Duration) (*Lease, error) {
	repository, ok := s.repository.(WorkerRepository)
	if !ok {
		return nil, errors.New("avatar pipeline repository does not support worker leases")
	}
	return repository.ClaimNext(ctx, workerID, s.now(), duration)
}

func (s *Service) RenewJobLease(ctx context.Context, lease *Lease, duration time.Duration) error {
	if lease == nil || lease.Job == nil || lease.Token == "" {
		return ErrLeaseLost
	}
	repository, ok := s.repository.(WorkerRepository)
	if !ok {
		return errors.New("avatar pipeline repository does not support worker leases")
	}
	expiresAt, err := repository.RenewLease(ctx, lease.Job.ID, lease.Token, lease.WorkerID, s.now(), duration)
	if err != nil {
		return err
	}
	lease.ExpiresAt = expiresAt
	return nil
}

func (s *Service) ReleaseJobLease(ctx context.Context, lease *Lease) error {
	if lease == nil || lease.Job == nil || lease.Token == "" {
		return ErrLeaseLost
	}
	repository, ok := s.repository.(WorkerRepository)
	if !ok {
		return errors.New("avatar pipeline repository does not support worker leases")
	}
	if err := repository.ReleaseLease(ctx, lease.Job.ID, lease.Token, lease.WorkerID); err != nil {
		return err
	}
	consumeLease(lease)
	return nil
}

func (s *Service) AdvanceLeasedJob(ctx context.Context, lease *Lease, next State, evidence *Evidence) (*Job, error) {
	if lease == nil || lease.Job == nil || lease.Token == "" {
		return nil, ErrLeaseLost
	}
	repository, ok := s.repository.(WorkerRepository)
	if !ok {
		return nil, errors.New("avatar pipeline repository does not support worker leases")
	}
	now := s.now()
	job := cloneJob(lease.Job)
	expectedVersion := job.Version
	if err := job.Advance(next, evidence, now); err != nil {
		return nil, err
	}
	if err := repository.UpdateLeased(ctx, job, expectedVersion, lease.Token, lease.WorkerID, now); err != nil {
		return nil, err
	}
	lease.Job = cloneJob(job)
	consumeLease(lease)
	return cloneJob(job), nil
}

// AdvanceLeasedJobWithProviderDispatch atomically enters reconstruction and
// records the paid-call command. No provider call is allowed before this
// operation commits.
func (s *Service) AdvanceLeasedJobWithProviderDispatch(ctx context.Context, lease *Lease, evidence *Evidence, set ReferenceSet, provider, model string, maxCredits int) (*Job, *ProviderDispatch, error) {
	if lease == nil || lease.Job == nil || lease.Token == "" {
		return nil, nil, ErrLeaseLost
	}
	repository, ok := s.repository.(ProviderDispatchRepository)
	if !ok {
		return nil, nil, errors.New("avatar pipeline repository does not support provider dispatches")
	}
	now := s.now()
	job := cloneJob(lease.Job)
	expectedVersion := job.Version
	if err := job.Advance(StateReconstructing, evidence, now); err != nil {
		return nil, nil, err
	}
	dispatch, err := newProviderDispatch(job, set, provider, model, maxCredits, now)
	if err != nil {
		return nil, nil, err
	}
	if err := repository.UpdateLeasedWithDispatch(ctx, job, expectedVersion, lease.Token, lease.WorkerID, now, dispatch); err != nil {
		return nil, nil, err
	}
	lease.Job = cloneJob(job)
	consumeLease(lease)
	return cloneJob(job), cloneDispatch(dispatch), nil
}

func (s *Service) RecordLeasedJobFailure(ctx context.Context, lease *Lease, reasonCode string) (*Job, error) {
	if lease == nil || lease.Job == nil || lease.Token == "" {
		return nil, ErrLeaseLost
	}
	repository, ok := s.repository.(WorkerRepository)
	if !ok {
		return nil, errors.New("avatar pipeline repository does not support worker leases")
	}
	now := s.now()
	job := cloneJob(lease.Job)
	expectedVersion := job.Version
	if _, err := job.RecordFailure(reasonCode, now); err != nil {
		return nil, err
	}
	if err := repository.UpdateLeased(ctx, job, expectedVersion, lease.Token, lease.WorkerID, now); err != nil {
		return nil, err
	}
	lease.Job = cloneJob(job)
	consumeLease(lease)
	return cloneJob(job), nil
}

func consumeLease(lease *Lease) {
	lease.Token = ""
	lease.ExpiresAt = time.Time{}
}

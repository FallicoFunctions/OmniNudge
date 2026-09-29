package pipeline

import (
	"context"
	"errors"
	"time"
)

type Service struct {
	repository Repository
	now        func() time.Time
}

func NewService(repository Repository) (*Service, error) {
	if repository == nil {
		return nil, errors.New("avatar pipeline repository is required")
	}
	return &Service{repository: repository, now: time.Now}, nil
}

func (s *Service) CreateJob(ctx context.Context, ownerID, maxRetries int, idempotencyKey string) (*Job, bool, error) {
	if err := ValidateIdempotencyKey(idempotencyKey); err != nil {
		return nil, false, err
	}
	job, err := NewJob(ownerID, maxRetries, s.now())
	if err != nil {
		return nil, false, err
	}
	return s.repository.Create(ctx, job, idempotencyKey)
}

func (s *Service) GetOwnedJob(ctx context.Context, ownerID int, jobID string) (*Job, error) {
	if ownerID <= 0 || ValidateJobID(jobID) != nil {
		return nil, ErrJobNotFound
	}
	return s.repository.GetOwned(ctx, jobID, ownerID)
}

func (s *Service) CancelOwnedJob(ctx context.Context, ownerID int, jobID string, expectedVersion int) (*Job, error) {
	job, err := s.GetOwnedJob(ctx, ownerID, jobID)
	if err != nil {
		return nil, err
	}
	if expectedVersion != job.Version {
		return nil, ErrJobVersionConflict
	}
	if err := job.Cancel(s.now()); err != nil {
		return nil, err
	}
	if err := s.repository.UpdateOwnedCancellation(ctx, job, expectedVersion); err != nil {
		return nil, err
	}
	return cloneJob(job), nil
}

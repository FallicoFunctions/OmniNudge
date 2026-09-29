package pipeline

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

var (
	ErrNoClaimableDispatches = errors.New("no provider dispatches are claimable")
	ErrDispatchLeaseLost     = errors.New("provider dispatch lease was lost")
)

const maxDispatchAttempts = 5

type DispatchStatus string

const (
	DispatchPending   DispatchStatus = "pending"
	DispatchSubmitted DispatchStatus = "submitted"
	DispatchFailed    DispatchStatus = "failed"
	DispatchCancelled DispatchStatus = "cancelled"
)

// ProviderDispatch is the durable, provider-neutral command that crosses the
// transaction boundary before any paid reconstruction call is attempted.
type ProviderDispatch struct {
	ID            string                `json:"id"`
	JobID         string                `json:"jobId"`
	JobVersion    int                   `json:"jobVersion"`
	Provider      string                `json:"provider"`
	Request       ReconstructionRequest `json:"request"`
	Status        DispatchStatus        `json:"status"`
	Task          *ProviderTask         `json:"task,omitempty"`
	Attempt       int                   `json:"attempt"`
	LastErrorCode string                `json:"lastErrorCode,omitempty"`
	AvailableAt   time.Time             `json:"availableAt"`
	CreatedAt     time.Time             `json:"createdAt"`
	UpdatedAt     time.Time             `json:"updatedAt"`
}

func (d ProviderDispatch) Validate() error {
	if err := validateCanonicalUUID("dispatch", d.ID); err != nil {
		return err
	}
	if err := validateCanonicalUUID("dispatch job", d.JobID); err != nil {
		return err
	}
	if d.JobVersion < 2 || d.JobVersion > maxPersistedEvents+1 {
		return errors.New("dispatch job version is outside the persisted job range")
	}
	if d.Provider == "" || !providerIdentifierPattern.MatchString(d.Provider) {
		return errors.New("provider must contain 1 to 128 safe characters")
	}
	if err := d.Request.Validate(); err != nil {
		return fmt.Errorf("invalid provider request: %w", err)
	}
	if d.Request.JobID != d.JobID {
		return errors.New("provider request job does not match dispatch job")
	}
	if d.Request.IdempotencyKey != "omniavatar:"+d.ID {
		return errors.New("provider request idempotency key must be derived from the dispatch ID")
	}
	if d.Attempt < 0 || d.Attempt > maxDispatchAttempts {
		return errors.New("dispatch attempt is outside the allowed range")
	}
	if d.AvailableAt.IsZero() || d.CreatedAt.IsZero() || d.UpdatedAt.IsZero() || d.UpdatedAt.Before(d.CreatedAt) {
		return errors.New("dispatch timestamps are incomplete or out of order")
	}
	if d.LastErrorCode != "" {
		if err := validateReasonCode(d.LastErrorCode); err != nil {
			return fmt.Errorf("invalid dispatch error code: %w", err)
		}
	}
	switch d.Status {
	case DispatchPending:
		if d.Task != nil || d.Attempt >= maxDispatchAttempts {
			return errors.New("pending dispatch cannot have a task or exhausted attempts")
		}
	case DispatchSubmitted:
		if d.Task == nil {
			return errors.New("submitted dispatch requires a provider task")
		}
		if err := d.Task.Validate(); err != nil {
			return err
		}
		if d.Task.Provider != d.Provider || d.Task.Model != d.Request.Model {
			return errors.New("provider task does not match the immutable dispatch route")
		}
	case DispatchFailed:
		if d.Task != nil || d.Attempt != maxDispatchAttempts || d.LastErrorCode == "" {
			return errors.New("failed dispatch requires exhausted attempts and an error code")
		}
	case DispatchCancelled:
		if d.Task != nil {
			return errors.New("cancelled pending dispatch cannot have a provider task")
		}
	default:
		return fmt.Errorf("unknown dispatch status %q", d.Status)
	}
	return nil
}

type DispatchLease struct {
	Dispatch  *ProviderDispatch
	Token     string
	WorkerID  string
	ExpiresAt time.Time
}

type ProviderDispatchRepository interface {
	WorkerRepository
	UpdateLeasedWithDispatch(ctx context.Context, job *Job, expectedVersion int, token, workerID string, now time.Time, dispatch *ProviderDispatch) error
	ClaimNextDispatch(ctx context.Context, workerID string, now time.Time, duration time.Duration) (*DispatchLease, error)
	MarkDispatchSubmitted(ctx context.Context, dispatchID, token, workerID string, now time.Time, task ProviderTask) (*ProviderDispatch, error)
	RecordDispatchFailure(ctx context.Context, dispatchID, token, workerID string, now, retryAt time.Time, reasonCode string) (*ProviderDispatch, error)
}

func newProviderDispatch(job *Job, set ReferenceSet, provider, model string, maxCredits int, now time.Time) (*ProviderDispatch, error) {
	if job == nil || job.State != StateReconstructing || len(job.Events) == 0 || job.Events[len(job.Events)-1].From != StateCheckingConsistency {
		return nil, errors.New("provider dispatch requires a checking_consistency to reconstructing transition")
	}
	if set.JobID != job.ID || set.OwnerID != job.OwnerID {
		return nil, errors.New("reference set does not belong to the transitioned job")
	}
	keys, err := set.OrderedReferenceKeys()
	if err != nil {
		return nil, err
	}
	dispatchID := uuid.NewString()
	dispatch := &ProviderDispatch{
		ID:         dispatchID,
		JobID:      job.ID,
		JobVersion: job.Version,
		Provider:   provider,
		Request: ReconstructionRequest{
			JobID:          job.ID,
			OwnerID:        job.OwnerID,
			ReferenceKeys:  keys,
			IdempotencyKey: "omniavatar:" + dispatchID,
			MaxCredits:     maxCredits,
			Model:          model,
		},
		Status:      DispatchPending,
		AvailableAt: now.UTC(),
		CreatedAt:   now.UTC(),
		UpdatedAt:   now.UTC(),
	}
	if err := dispatch.Validate(); err != nil {
		return nil, err
	}
	return dispatch, nil
}

func cloneDispatch(dispatch *ProviderDispatch) *ProviderDispatch {
	if dispatch == nil {
		return nil
	}
	copy := *dispatch
	copy.Request.ReferenceKeys = append([]string(nil), dispatch.Request.ReferenceKeys...)
	if dispatch.Task != nil {
		task := *dispatch.Task
		copy.Task = &task
	}
	return &copy
}

package pipeline

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// ReconstructionProvider is the replaceable boundary for Tripo, Hyper3D,
// future OpenAI models, or an internal generator. Implementations receive
// storage object keys, never client-controlled URLs or provider credentials.
type ReconstructionProvider interface {
	Name() string
	Capabilities() ProviderCapabilities
	Submit(context.Context, ReconstructionRequest) (ProviderTask, error)
	Poll(context.Context, ProviderTask) (ProviderResult, error)
	Cancel(context.Context, ProviderTask) error
}

type ProviderCapabilities struct {
	Multiview       bool `json:"multiview"`
	ProducesPBR     bool `json:"producesPbr"`
	ProducesRig     bool `json:"producesRig"`
	ProducesTexture bool `json:"producesTexture"`
}

type ReconstructionRequest struct {
	JobID          string   `json:"jobId"`
	OwnerID        int      `json:"ownerId"`
	ReferenceKeys  []string `json:"referenceKeys"`
	IdempotencyKey string   `json:"idempotencyKey"`
	MaxCredits     int      `json:"maxCredits"`
	Model          string   `json:"model"`
}

var idempotencyKeyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{16,128}$`)
var providerIdentifierPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)

func ValidateIdempotencyKey(value string) error {
	if value != strings.TrimSpace(value) || !idempotencyKeyPattern.MatchString(value) {
		return errors.New("idempotency key must contain 16 to 128 safe characters")
	}
	return nil
}

func (r ReconstructionRequest) Validate() error {
	if err := validateCanonicalUUID("job", r.JobID); err != nil {
		return err
	}
	if r.OwnerID <= 0 {
		return errors.New("owner ID is required")
	}
	if len(r.ReferenceKeys) < 6 || len(r.ReferenceKeys) > 7 {
		return errors.New("reconstruction requires 6 normalized reference views and at most one face close-up")
	}
	seen := make(map[string]struct{}, len(r.ReferenceKeys))
	for _, key := range r.ReferenceKeys {
		if err := validateNormalizedReferenceKey("reference", key, r.JobID); err != nil {
			return err
		}
		if _, exists := seen[key]; exists {
			return fmt.Errorf("duplicate reference storage key %q", key)
		}
		seen[key] = struct{}{}
	}
	if err := ValidateIdempotencyKey(r.IdempotencyKey); err != nil {
		return err
	}
	if r.MaxCredits <= 0 {
		return errors.New("a positive per-job credit ceiling is required")
	}
	if r.Model != strings.TrimSpace(r.Model) || !providerIdentifierPattern.MatchString(r.Model) {
		return errors.New("provider model must contain 1 to 128 safe characters")
	}
	return nil
}

type ProviderTask struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	TaskID   string `json:"taskId"`
}

func (t ProviderTask) Validate() error {
	validProvider := t.Provider == strings.TrimSpace(t.Provider) && providerIdentifierPattern.MatchString(t.Provider)
	validModel := t.Model == strings.TrimSpace(t.Model) && providerIdentifierPattern.MatchString(t.Model)
	validTaskID := t.TaskID == strings.TrimSpace(t.TaskID) && providerIdentifierPattern.MatchString(t.TaskID)
	if !validProvider || !validModel || !validTaskID {
		return errors.New("provider, model, and provider task ID must contain 1 to 128 safe characters")
	}
	return nil
}

type ProviderResult struct {
	Status       string    `json:"status"`
	ArtifactKey  string    `json:"artifactKey,omitempty"`
	ProviderCost int       `json:"providerCost"`
	CompletedAt  time.Time `json:"completedAt,omitempty"`
}

const (
	ProviderStatusQueued    = "queued"
	ProviderStatusRunning   = "running"
	ProviderStatusSucceeded = "succeeded"
	ProviderStatusFailed    = "failed"
	ProviderStatusCancelled = "cancelled"
)

func (r ProviderResult) Validate(jobID string, maxCredits int) error {
	if err := validateCanonicalUUID("job", jobID); err != nil {
		return err
	}
	if maxCredits <= 0 {
		return errors.New("a positive per-job credit ceiling is required")
	}
	switch r.Status {
	case ProviderStatusQueued, ProviderStatusRunning:
		if r.ArtifactKey != "" || !r.CompletedAt.IsZero() {
			return errors.New("in-progress provider result cannot contain a final artifact or completion time")
		}
	case ProviderStatusSucceeded:
		if err := validateJobStorageKey("provider artifact", r.ArtifactKey, jobID); err != nil {
			return err
		}
		if r.CompletedAt.IsZero() {
			return errors.New("successful provider result requires a completion time")
		}
	case ProviderStatusFailed, ProviderStatusCancelled:
		if r.ArtifactKey != "" || r.CompletedAt.IsZero() {
			return errors.New("finished provider result requires a completion time and no artifact unless it succeeded")
		}
	default:
		return fmt.Errorf("unknown provider status %q", r.Status)
	}
	if r.ProviderCost < 0 || r.ProviderCost > maxCredits {
		return fmt.Errorf("provider cost %d is outside the authorized range 0..%d", r.ProviderCost, maxCredits)
	}
	return nil
}

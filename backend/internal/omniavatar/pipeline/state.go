package pipeline

import (
	"errors"
	"fmt"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

type State string

const (
	maxJobRetries      = 5
	maxPersistedEvents = 27
)

const (
	StateQueued              State = "queued"
	StateValidatingImage     State = "validating_image"
	StateGeneratingViews     State = "generating_views"
	StateCheckingConsistency State = "checking_consistency"
	StateReconstructing      State = "reconstructing"
	StateConformingTopology  State = "conforming_topology"
	StateTexturingPBR        State = "texturing_pbr"
	StateSeparatingSlots     State = "separating_slots"
	StateRiggingSkinning     State = "rigging_skinning"
	StateRetargeting         State = "retargeting"
	StateTesting             State = "testing"
	StateReady               State = "ready"
	StatePublished           State = "published"
	StateFailedRetryable     State = "failed_retryable"
	StateManualReview        State = "manual_review"
	StateCancelled           State = "cancelled"
)

var activeSequence = []State{
	StateQueued,
	StateValidatingImage,
	StateGeneratingViews,
	StateCheckingConsistency,
	StateReconstructing,
	StateConformingTopology,
	StateTexturingPBR,
	StateSeparatingSlots,
	StateRiggingSkinning,
	StateRetargeting,
	StateTesting,
	StateReady,
	StatePublished,
}

var sequenceIndex = func() map[State]int {
	result := make(map[State]int, len(activeSequence))
	for index, state := range activeSequence {
		result[state] = index
	}
	return result
}()

var sha256Pattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var storageKeyPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]*$`)

type Evidence struct {
	ArtifactKind      string    `json:"artifactKind"`
	ArtifactKey       string    `json:"artifactKey"`
	ArtifactSHA256    string    `json:"artifactSha256"`
	ArtifactMediaType string    `json:"artifactMediaType"`
	ArtifactBytes     int64     `json:"artifactBytes"`
	ReportKey         string    `json:"reportKey"`
	ReportSHA256      string    `json:"reportSha256"`
	ReportMediaType   string    `json:"reportMediaType"`
	ReportBytes       int64     `json:"reportBytes"`
	CreatedAt         time.Time `json:"createdAt"`
}

func (e Evidence) Validate() error {
	if !providerIdentifierPattern.MatchString(e.ArtifactKind) {
		return errors.New("artifact kind must contain 1 to 128 safe characters")
	}
	if err := validateStorageKey("artifact", e.ArtifactKey); err != nil {
		return err
	}
	if err := validateStorageKey("report", e.ReportKey); err != nil {
		return err
	}
	if e.ArtifactKey == e.ReportKey {
		return errors.New("artifact and report storage keys must be distinct")
	}
	if !sha256Pattern.MatchString(e.ArtifactSHA256) {
		return errors.New("artifact SHA-256 must be 64 lowercase hexadecimal characters")
	}
	if !sha256Pattern.MatchString(e.ReportSHA256) {
		return errors.New("report SHA-256 must be 64 lowercase hexadecimal characters")
	}
	if _, allowed := allowedArtifactMediaTypes[e.ArtifactMediaType]; !allowed {
		return errors.New("artifact media type is not allowed")
	}
	if err := validateMediaExtension(e.ArtifactKey, e.ArtifactMediaType); err != nil {
		return fmt.Errorf("artifact %w", err)
	}
	if e.ArtifactBytes <= 0 || e.ArtifactBytes > maxArtifactBytes {
		return errors.New("artifact byte length is outside the allowed range")
	}
	if e.ReportMediaType != "application/json" {
		return errors.New("report media type must be application/json")
	}
	if err := validateMediaExtension(e.ReportKey, e.ReportMediaType); err != nil {
		return fmt.Errorf("report %w", err)
	}
	if e.ReportBytes <= 0 || e.ReportBytes > maxReportBytes {
		return errors.New("report byte length is outside the allowed range")
	}
	if e.CreatedAt.IsZero() {
		return errors.New("evidence creation time is required")
	}
	return nil
}

func validateStorageKey(label, key string) error {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return fmt.Errorf("%s storage key is required", label)
	}
	if len(key) > 1024 {
		return fmt.Errorf("%s storage key exceeds 1024 bytes", label)
	}
	if key != trimmed {
		return fmt.Errorf("%s storage key must not contain surrounding whitespace", label)
	}
	if !storageKeyPattern.MatchString(key) || strings.HasPrefix(key, "/") || path.Clean(key) != key {
		return fmt.Errorf("%s storage key must be a canonical relative object key", label)
	}
	if key == "." || key == ".." || strings.HasPrefix(key, "../") {
		return fmt.Errorf("%s storage key leaves the configured artifact namespace", label)
	}
	return nil
}

type Event struct {
	From       State     `json:"from"`
	To         State     `json:"to"`
	ReasonCode string    `json:"reasonCode,omitempty"`
	Evidence   *Evidence `json:"evidence,omitempty"`
	OccurredAt time.Time `json:"occurredAt"`
}

type Job struct {
	ID            string    `json:"id"`
	OwnerID       int       `json:"ownerId"`
	State         State     `json:"state"`
	ResumeState   State     `json:"resumeState,omitempty"`
	RetryCount    int       `json:"retryCount"`
	MaxRetries    int       `json:"maxRetries"`
	Version       int       `json:"version"`
	FailureReason string    `json:"failureReason,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
	Events        []Event   `json:"events"`
}

func NewJob(ownerID, maxRetries int, now time.Time) (*Job, error) {
	if ownerID <= 0 {
		return nil, errors.New("owner ID is required")
	}
	if maxRetries < 0 || maxRetries > maxJobRetries {
		return nil, errors.New("max retries must be between 0 and 5")
	}
	if now.IsZero() {
		return nil, errors.New("creation time is required")
	}
	return &Job{
		ID:         uuid.NewString(),
		OwnerID:    ownerID,
		State:      StateQueued,
		MaxRetries: maxRetries,
		Version:    1,
		CreatedAt:  now.UTC(),
		UpdatedAt:  now.UTC(),
		Events:     []Event{},
	}, nil
}

func (j *Job) Advance(next State, evidence *Evidence, now time.Time) error {
	if err := j.validateTransitionTime(now); err != nil {
		return err
	}
	if j.IsTerminal() {
		return fmt.Errorf("job is terminal in state %q", j.State)
	}
	if j.State == StateFailedRetryable {
		if next != j.ResumeState {
			return fmt.Errorf("retry must resume at %q, not %q", j.ResumeState, next)
		}
		if evidence != nil {
			return errors.New("retry resume cannot claim new stage evidence")
		}
		return j.transition(next, nil, "retry_resumed", now)
	}

	currentIndex, currentOK := sequenceIndex[j.State]
	nextIndex, nextOK := sequenceIndex[next]
	if !currentOK || !nextOK || nextIndex != currentIndex+1 {
		return fmt.Errorf("invalid pipeline transition %q -> %q", j.State, next)
	}
	if j.State != StateQueued {
		if evidence == nil {
			return fmt.Errorf("evidence is required to leave %q", j.State)
		}
		if err := evidence.Validate(); err != nil {
			return fmt.Errorf("invalid transition evidence: %w", err)
		}
		if evidence.CreatedAt.Before(j.UpdatedAt) || evidence.CreatedAt.After(now) {
			return errors.New("transition evidence must be created during the active stage and no later than the transition")
		}
		if err := validateJobStorageKey("artifact", evidence.ArtifactKey, j.ID); err != nil {
			return err
		}
		if err := validateJobStorageKey("report", evidence.ReportKey, j.ID); err != nil {
			return err
		}
		if err := j.validateNewEvidenceKeys(evidence); err != nil {
			return err
		}
	}
	return j.transition(next, evidence, "", now)
}

func (j *Job) validateNewEvidenceKeys(evidence *Evidence) error {
	for _, event := range j.Events {
		if event.Evidence == nil {
			continue
		}
		for _, existing := range []string{event.Evidence.ArtifactKey, event.Evidence.ReportKey} {
			if evidence.ArtifactKey == existing || evidence.ReportKey == existing {
				return fmt.Errorf("transition evidence storage key %q is already used by this job", existing)
			}
		}
	}
	return nil
}

func (j *Job) RecordFailure(reasonCode string, now time.Time) (State, error) {
	if j.IsTerminal() {
		return j.State, fmt.Errorf("job is terminal in state %q", j.State)
	}
	if j.State == StateFailedRetryable {
		return j.State, errors.New("retryable failure must be resumed or sent to manual review before recording another failure")
	}
	if err := validateReasonCode(reasonCode); err != nil {
		return j.State, err
	}
	if err := j.validateTransitionTime(now); err != nil {
		return j.State, err
	}
	from := j.State
	to := StateManualReview
	if j.RetryCount < j.MaxRetries {
		j.RetryCount++
		j.ResumeState = retryTarget(from)
		to = StateFailedRetryable
	}
	j.State = to
	j.FailureReason = reasonCode
	j.Version++
	j.UpdatedAt = now.UTC()
	j.Events = append(j.Events, Event{From: from, To: to, ReasonCode: reasonCode, OccurredAt: now.UTC()})
	return to, nil
}

func retryTarget(failedAt State) State {
	switch failedAt {
	case StateCheckingConsistency:
		return StateGeneratingViews
	default:
		return failedAt
	}
}

func (j *Job) SendToManualReview(reasonCode string, now time.Time) error {
	if j.IsTerminal() {
		return fmt.Errorf("job is terminal in state %q", j.State)
	}
	if err := validateReasonCode(reasonCode); err != nil {
		return err
	}
	if err := j.validateTransitionTime(now); err != nil {
		return err
	}
	return j.transition(StateManualReview, nil, reasonCode, now)
}

func (j *Job) Cancel(now time.Time) error {
	if j.IsTerminal() {
		return fmt.Errorf("job is terminal in state %q", j.State)
	}
	if err := j.validateTransitionTime(now); err != nil {
		return err
	}
	return j.transition(StateCancelled, nil, "user_cancelled", now)
}

func (j *Job) IsTerminal() bool {
	return j.State == StatePublished || j.State == StateManualReview || j.State == StateCancelled
}

func (j *Job) transition(next State, evidence *Evidence, reasonCode string, now time.Time) error {
	from := j.State
	j.State = next
	if next == StateManualReview {
		j.FailureReason = reasonCode
	} else {
		j.FailureReason = ""
	}
	if next != StateFailedRetryable {
		j.ResumeState = ""
	}
	j.Version++
	j.UpdatedAt = now.UTC()
	j.Events = append(j.Events, Event{
		From:       from,
		To:         next,
		ReasonCode: reasonCode,
		Evidence:   cloneEvidence(evidence),
		OccurredAt: now.UTC(),
	})
	return nil
}

func (j *Job) validateTransitionTime(now time.Time) error {
	if now.IsZero() {
		return errors.New("transition time is required")
	}
	if now.Before(j.CreatedAt) || now.Before(j.UpdatedAt) {
		return errors.New("transition time cannot move backwards")
	}
	return nil
}

func cloneEvidence(evidence *Evidence) *Evidence {
	if evidence == nil {
		return nil
	}
	copy := *evidence
	return &copy
}

func validateJobStorageKey(label, key, jobID string) error {
	if err := validateStorageKey(label, key); err != nil {
		return err
	}
	prefix := "omniavatar/jobs/" + jobID + "/"
	if !strings.HasPrefix(key, prefix) {
		return fmt.Errorf("%s storage key must stay within job namespace %q", label, prefix)
	}
	return nil
}

func validateNormalizedReferenceKey(label, key, jobID string) error {
	if err := validateJobStorageKey(label, key, jobID); err != nil {
		return err
	}
	if extension := path.Ext(key); extension != ".png" && extension != ".webp" {
		return fmt.Errorf("%s storage key must use a .png or .webp extension", label)
	}
	return nil
}

func validateReasonCode(reasonCode string) error {
	if reasonCode != strings.TrimSpace(reasonCode) || !providerIdentifierPattern.MatchString(reasonCode) {
		return errors.New("reason code must contain 1 to 128 safe characters")
	}
	return nil
}

// ValidateReasonCode applies the shared persisted failure-code contract.
func ValidateReasonCode(reasonCode string) error {
	return validateReasonCode(reasonCode)
}

func (j *Job) ValidateSnapshot() error {
	if err := validateCanonicalUUID("persisted job", j.ID); err != nil || j.OwnerID <= 0 {
		return errors.New("persisted job identity is invalid")
	}
	if _, ok := sequenceIndex[j.State]; !ok && j.State != StateFailedRetryable && !j.IsTerminal() {
		return fmt.Errorf("persisted job state %q is invalid", j.State)
	}
	if j.MaxRetries < 0 || j.MaxRetries > maxJobRetries || j.RetryCount < 0 || j.RetryCount > j.MaxRetries {
		return errors.New("persisted retry counters are invalid")
	}
	if j.Version < 1 || len(j.Events) != j.Version-1 || len(j.Events) > maxPersistedEvents {
		return errors.New("persisted job version does not match event history")
	}
	if j.CreatedAt.IsZero() || j.UpdatedAt.Before(j.CreatedAt) {
		return errors.New("persisted job timestamps are invalid")
	}
	if j.State == StateFailedRetryable {
		if _, ok := sequenceIndex[j.ResumeState]; !ok || j.ResumeState == StatePublished {
			return errors.New("retryable job is missing its resume state")
		}
	} else if j.ResumeState != "" {
		return errors.New("non-retryable job cannot retain a resume state")
	}
	if j.State == StateFailedRetryable || j.State == StateManualReview {
		if err := validateReasonCode(j.FailureReason); err != nil {
			return errors.New("failed job is missing a valid reason code")
		}
	} else if j.FailureReason != "" {
		return errors.New("non-failed job cannot retain a failure reason")
	}

	previousState := StateQueued
	previousTime := j.CreatedAt
	retryEvents := 0
	var pendingRetryTarget State
	seenEvidenceKeys := make(map[string]struct{}, 2*len(j.Events))
	for index, event := range j.Events {
		if event.From != previousState || event.OccurredAt.Before(previousTime) || event.OccurredAt.After(j.UpdatedAt) {
			return fmt.Errorf("persisted event %d breaks state or timestamp continuity", index+1)
		}
		if err := validatePersistedEvent(event); err != nil {
			return fmt.Errorf("persisted event %d is invalid: %w", index+1, err)
		}
		if event.From == StateFailedRetryable {
			if pendingRetryTarget == "" {
				return fmt.Errorf("persisted event %d has no pending retry to resolve", index+1)
			}
			if event.To != StateManualReview && event.To != StateCancelled && event.To != pendingRetryTarget {
				return fmt.Errorf("persisted event %d resumes retry at %q instead of %q", index+1, event.To, pendingRetryTarget)
			}
			pendingRetryTarget = ""
		}
		if event.To == StateFailedRetryable {
			retryEvents++
			pendingRetryTarget = retryTarget(event.From)
		}
		if event.Evidence != nil {
			if err := event.Evidence.Validate(); err != nil {
				return fmt.Errorf("persisted event %d evidence is invalid: %w", index+1, err)
			}
			if event.Evidence.CreatedAt.Before(previousTime) || event.Evidence.CreatedAt.After(event.OccurredAt) {
				return fmt.Errorf("persisted event %d evidence falls outside the active stage time window", index+1)
			}
			if err := validateJobStorageKey("artifact", event.Evidence.ArtifactKey, j.ID); err != nil {
				return err
			}
			if err := validateJobStorageKey("report", event.Evidence.ReportKey, j.ID); err != nil {
				return err
			}
			for _, key := range []string{event.Evidence.ArtifactKey, event.Evidence.ReportKey} {
				if _, duplicate := seenEvidenceKeys[key]; duplicate {
					return fmt.Errorf("persisted event %d reuses evidence storage key %q", index+1, key)
				}
				seenEvidenceKeys[key] = struct{}{}
			}
		}
		previousState = event.To
		previousTime = event.OccurredAt
	}
	if len(j.Events) == 0 {
		if j.State != StateQueued || !j.UpdatedAt.Equal(j.CreatedAt) {
			return errors.New("job without events must be queued")
		}
	} else {
		if previousState != j.State || !previousTime.Equal(j.UpdatedAt) {
			return errors.New("persisted final event does not match job state or update time")
		}
		if (j.State == StateFailedRetryable || j.State == StateManualReview) && j.FailureReason != j.Events[len(j.Events)-1].ReasonCode {
			return errors.New("persisted failure reason does not match the final event")
		}
	}
	if retryEvents != j.RetryCount {
		return errors.New("persisted retry count does not match event history")
	}
	if j.State == StateFailedRetryable {
		if pendingRetryTarget == "" || j.ResumeState != pendingRetryTarget {
			return errors.New("persisted retry target does not match failure history")
		}
	} else if pendingRetryTarget != "" {
		return errors.New("persisted retry failure has no matching resume event")
	}
	return nil
}

func validateCanonicalUUID(label, value string) error {
	parsed, err := uuid.Parse(value)
	if err != nil || parsed == uuid.Nil || parsed.Version() != 4 || parsed.Variant() != uuid.RFC4122 || parsed.String() != value {
		return fmt.Errorf("%s ID must be a canonical UUIDv4", label)
	}
	return nil
}

// ValidateJobID is shared by persistence adapters so malformed external IDs
// fail before reaching database UUID casts or object namespaces.
func ValidateJobID(value string) error {
	return validateCanonicalUUID("job", value)
}

func validatePersistedEvent(event Event) error {
	if event.OccurredAt.IsZero() {
		return errors.New("event time is required")
	}
	if event.ReasonCode != "" {
		if err := validateReasonCode(event.ReasonCode); err != nil {
			return err
		}
	}
	if event.To == StateFailedRetryable || event.To == StateManualReview || event.To == StateCancelled {
		if event.ReasonCode == "" || event.Evidence != nil || event.From == StatePublished || event.From == StateManualReview || event.From == StateCancelled {
			return errors.New("terminal/failure transition has invalid reason, evidence, or origin")
		}
		if event.To == StateFailedRetryable && event.From == StateFailedRetryable {
			return errors.New("retryable failure cannot transition directly to another retryable failure")
		}
		if event.To == StateCancelled && event.ReasonCode != "user_cancelled" {
			return errors.New("cancelled transition has an invalid reason")
		}
		return nil
	}
	if event.From == StateFailedRetryable {
		if event.ReasonCode != "retry_resumed" || event.Evidence != nil {
			return errors.New("retry resume must be evidence-free and explicitly identified")
		}
		if _, ok := sequenceIndex[event.To]; !ok || event.To == StatePublished {
			return errors.New("retry resumes to an invalid active state")
		}
		return nil
	}
	currentIndex, currentOK := sequenceIndex[event.From]
	nextIndex, nextOK := sequenceIndex[event.To]
	if !currentOK || !nextOK || nextIndex != currentIndex+1 || event.ReasonCode != "" {
		return errors.New("event skips the ordered pipeline sequence")
	}
	if event.From == StateQueued {
		if event.Evidence != nil {
			return errors.New("queued transition cannot claim evidence")
		}
	} else if event.Evidence == nil {
		return errors.New("ordered stage transition is missing evidence")
	}
	return nil
}

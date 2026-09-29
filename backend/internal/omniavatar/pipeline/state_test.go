package pipeline

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

var testTime = time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)

func validEvidence(jobID, kind string) *Evidence {
	return &Evidence{
		ArtifactKind:      kind,
		ArtifactKey:       "omniavatar/jobs/" + jobID + "/" + kind + ".bin",
		ArtifactSHA256:    strings.Repeat("a", 64),
		ArtifactMediaType: "application/octet-stream",
		ArtifactBytes:     1,
		ReportKey:         "omniavatar/jobs/" + jobID + "/" + kind + ".report.json",
		ReportSHA256:      strings.Repeat("b", 64),
		ReportMediaType:   "application/json",
		ReportBytes:       2,
		CreatedAt:         testTime,
	}
}

func TestJobHappyPathRequiresOrderedEvidence(t *testing.T) {
	job, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	require.NotEqual(t, "", job.ID)
	require.NoError(t, job.Advance(StateValidatingImage, nil, testTime.Add(time.Minute)))

	states := []State{
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
	for index, state := range states {
		transitionAt := testTime.Add(time.Duration(index+2) * time.Minute)
		evidence := validEvidence(job.ID, string(job.State))
		evidence.CreatedAt = transitionAt
		require.NoError(t, job.Advance(state, evidence, transitionAt))
	}
	require.Equal(t, StatePublished, job.State)
	require.True(t, job.IsTerminal())
}

func TestJobRejectsSkippedStageAndMissingEvidence(t *testing.T) {
	job, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	require.Error(t, job.Advance(StateReconstructing, nil, testTime.Add(time.Minute)))
	require.NoError(t, job.Advance(StateValidatingImage, nil, testTime.Add(time.Minute)))
	require.ErrorContains(t, job.Advance(StateGeneratingViews, nil, testTime.Add(2*time.Minute)), "evidence is required")
	require.Equal(t, StateValidatingImage, job.State)
}

func TestJobRejectsUnsafeArtifactKeys(t *testing.T) {
	evidence := validEvidence("00000000-0000-4000-8000-000000000001", "validated-image")
	evidence.ArtifactKey = "../another-user/source.png"
	require.ErrorContains(t, evidence.Validate(), "artifact storage key")
	evidence = validEvidence("00000000-0000-4000-8000-000000000001", "validated-image")
	evidence.ArtifactKey = "omniavatar\\jobs\\another-user\\source.png"
	require.ErrorContains(t, evidence.Validate(), "canonical relative object key")
	evidence = validEvidence("00000000-0000-4000-8000-000000000001", "validated-image")
	evidence.ArtifactKey += " "
	require.ErrorContains(t, evidence.Validate(), "whitespace")
	evidence = validEvidence("00000000-0000-4000-8000-000000000001", "validated-image")
	evidence.ArtifactKey += "\nforged"
	require.ErrorContains(t, evidence.Validate(), "canonical relative object key")
}

func TestJobRetriesBoundedlyThenRequiresManualReview(t *testing.T) {
	job, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	require.NoError(t, job.Advance(StateValidatingImage, nil, testTime.Add(time.Minute)))
	evidence := validEvidence(job.ID, "validated-image")
	evidence.CreatedAt = testTime.Add(2 * time.Minute)
	require.NoError(t, job.Advance(StateGeneratingViews, evidence, testTime.Add(2*time.Minute)))

	state, err := job.RecordFailure("provider_timeout", testTime.Add(3*time.Minute))
	require.NoError(t, err)
	require.Equal(t, StateFailedRetryable, state)
	require.Equal(t, StateGeneratingViews, job.ResumeState)
	require.NoError(t, job.Advance(StateGeneratingViews, nil, testTime.Add(4*time.Minute)))
	state, err = job.RecordFailure("provider_overloaded", testTime.Add(5*time.Minute))
	require.NoError(t, err)
	require.Equal(t, StateFailedRetryable, state)
	require.NoError(t, job.Advance(StateGeneratingViews, nil, testTime.Add(6*time.Minute)))
	state, err = job.RecordFailure("identity_inconsistent", testTime.Add(7*time.Minute))
	require.NoError(t, err)
	require.Equal(t, StateManualReview, state)
	require.True(t, job.IsTerminal())
}

func TestJobCancellationIsTerminal(t *testing.T) {
	job, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	require.NoError(t, job.Cancel(testTime.Add(time.Minute)))
	require.Error(t, job.Advance(StateValidatingImage, nil, testTime.Add(2*time.Minute)))
}

func TestReconstructionRequestIsProviderNeutralAndFailClosed(t *testing.T) {
	job, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	request := ReconstructionRequest{
		JobID:   job.ID,
		OwnerID: job.OwnerID,
		ReferenceKeys: []string{
			"omniavatar/jobs/" + job.ID + "/references/front.png",
			"omniavatar/jobs/" + job.ID + "/references/back.png",
			"omniavatar/jobs/" + job.ID + "/references/left.png",
			"omniavatar/jobs/" + job.ID + "/references/right.png",
			"omniavatar/jobs/" + job.ID + "/references/front-three-quarter.png",
			"omniavatar/jobs/" + job.ID + "/references/rear-three-quarter.png",
		},
		IdempotencyKey: "job-1-reconstruct-v1",
		MaxCredits:     100,
		Model:          "multiview-v1",
	}
	require.NoError(t, request.Validate())

	request.ReferenceKeys[0] = "../../another-user/front.png"
	require.Error(t, request.Validate())
	request.ReferenceKeys[0] = "omniavatar/jobs/" + job.ID + "/references/front.png"
	request.ReferenceKeys[0] = "omniavatar/jobs/" + job.ID + "/references/front.bin"
	require.ErrorContains(t, request.Validate(), ".png or .webp")
	request.ReferenceKeys[0] = "omniavatar/jobs/" + job.ID + "/references/front.png"
	request.MaxCredits = 0
	require.ErrorContains(t, request.Validate(), "credit ceiling")
}

func TestJobPreservesManualReviewReasonAndEvidenceSnapshot(t *testing.T) {
	job, err := NewJob(42, 1, testTime)
	require.NoError(t, err)
	require.NoError(t, job.Advance(StateValidatingImage, nil, testTime.Add(time.Minute)))
	evidence := validEvidence(job.ID, "validated-image")
	evidence.CreatedAt = testTime.Add(2 * time.Minute)
	require.NoError(t, job.Advance(StateGeneratingViews, evidence, testTime.Add(2*time.Minute)))
	evidence.ArtifactKind = "mutated-after-transition"
	require.Equal(t, "validated-image", job.Events[1].Evidence.ArtifactKind)
	require.NoError(t, job.SendToManualReview("identity_mismatch", testTime.Add(3*time.Minute)))
	require.Equal(t, "identity_mismatch", job.FailureReason)
}

func TestJobRejectsBackdatedTransitionAndCrossJobEvidence(t *testing.T) {
	job, err := NewJob(42, 1, testTime)
	require.NoError(t, err)
	require.ErrorContains(t, job.Advance(StateValidatingImage, nil, testTime.Add(-time.Second)), "backwards")
	require.NoError(t, job.Advance(StateValidatingImage, nil, testTime.Add(time.Minute)))
	evidence := validEvidence("00000000-0000-4000-8000-000000000001", "validated-image")
	evidence.CreatedAt = testTime.Add(2 * time.Minute)
	require.ErrorContains(t, job.Advance(StateGeneratingViews, evidence, testTime.Add(2*time.Minute)), "job namespace")
}

func TestJobRejectsEvidenceCreatedBeforeJob(t *testing.T) {
	job, err := NewJob(42, 1, testTime)
	require.NoError(t, err)
	require.NoError(t, job.Advance(StateValidatingImage, nil, testTime.Add(time.Minute)))
	evidence := validEvidence(job.ID, "validated-image")
	evidence.CreatedAt = testTime.Add(-time.Second)
	require.ErrorContains(t, job.Advance(StateGeneratingViews, evidence, testTime.Add(2*time.Minute)), "active stage")
}

func TestJobRejectsEvidenceCreatedBeforeActiveStage(t *testing.T) {
	job, err := NewJob(42, 1, testTime)
	require.NoError(t, err)
	require.NoError(t, job.Advance(StateValidatingImage, nil, testTime.Add(time.Minute)))
	evidence := validEvidence(job.ID, "validated-image")
	evidence.CreatedAt = testTime.Add(30 * time.Second)
	require.ErrorContains(t, job.Advance(StateGeneratingViews, evidence, testTime.Add(2*time.Minute)), "active stage")
}

func TestQueuedFailureRetriesQueuedAndRetryCannotClaimEvidence(t *testing.T) {
	job, err := NewJob(42, 1, testTime)
	require.NoError(t, err)
	state, err := job.RecordFailure("queue_unavailable", testTime.Add(time.Minute))
	require.NoError(t, err)
	require.Equal(t, StateFailedRetryable, state)
	require.Equal(t, StateQueued, job.ResumeState)
	require.ErrorContains(t, job.Advance(StateQueued, validEvidence(job.ID, "fake"), testTime.Add(2*time.Minute)), "cannot claim")
	require.NoError(t, job.Advance(StateQueued, nil, testTime.Add(2*time.Minute)))
}

func TestProviderResultValidationFailsClosed(t *testing.T) {
	job, err := NewJob(42, 1, testTime)
	require.NoError(t, err)
	valid := ProviderResult{
		Status:       ProviderStatusSucceeded,
		ArtifactKey:  "omniavatar/jobs/" + job.ID + "/provider/raw.glb",
		ProviderCost: 40,
		CompletedAt:  testTime,
	}
	require.NoError(t, valid.Validate(job.ID, 100))
	valid.ProviderCost = 101
	require.ErrorContains(t, valid.Validate(job.ID, 100), "authorized range")
	valid.ProviderCost = 40
	valid.ArtifactKey = "omniavatar/jobs/another-job/raw.glb"
	require.ErrorContains(t, valid.Validate(job.ID, 100), "job namespace")
}

func TestReconstructionRequestRejectsNonCanonicalModelAndJobID(t *testing.T) {
	job, err := NewJob(42, 1, testTime)
	require.NoError(t, err)
	request := ReconstructionRequest{
		JobID: job.ID, OwnerID: 42, MaxCredits: 10, Model: " model-v1 ",
		IdempotencyKey: "reconstruction-0001",
		ReferenceKeys: []string{
			"omniavatar/jobs/" + job.ID + "/references/front.png",
			"omniavatar/jobs/" + job.ID + "/references/back.png",
			"omniavatar/jobs/" + job.ID + "/references/left.png",
			"omniavatar/jobs/" + job.ID + "/references/right.png",
			"omniavatar/jobs/" + job.ID + "/references/front-three-quarter.png",
			"omniavatar/jobs/" + job.ID + "/references/rear-three-quarter.png",
		},
	}
	require.ErrorContains(t, request.Validate(), "provider model")
	request.Model = "model-v1"
	request.JobID = strings.ToUpper(job.ID)
	require.ErrorContains(t, request.Validate(), "canonical UUID")
	request.JobID = "00000000-0000-0000-0000-000000000000"
	require.ErrorContains(t, request.Validate(), "UUIDv4")
	request.JobID = "00000000-0000-1000-8000-000000000001"
	require.ErrorContains(t, request.Validate(), "UUIDv4")
	request.JobID = "00000000-0000-4000-0000-000000000001"
	require.ErrorContains(t, request.Validate(), "UUIDv4")
}

func TestEveryRetryRouteRemainsReplayValid(t *testing.T) {
	for _, failureState := range activeSequence[:len(activeSequence)-1] {
		failureState := failureState
		t.Run(string(failureState), func(t *testing.T) {
			job, err := NewJob(42, maxJobRetries, testTime)
			require.NoError(t, err)
			now := testTime
			evidenceSequence := 0
			advanceOne := func(next State) {
				now = now.Add(time.Second)
				var evidence *Evidence
				if job.State != StateQueued && job.State != StateFailedRetryable {
					evidenceSequence++
					evidence = validEvidence(job.ID, fmt.Sprintf("%s-%d", job.State, evidenceSequence))
					evidence.CreatedAt = now
				}
				require.NoError(t, job.Advance(next, evidence, now))
				require.NoError(t, job.ValidateSnapshot())
			}
			for job.State != failureState {
				advanceOne(activeSequence[sequenceIndex[job.State]+1])
			}
			for retry := 0; retry < maxJobRetries; retry++ {
				now = now.Add(time.Second)
				state, failureErr := job.RecordFailure("retryable_failure", now)
				require.NoError(t, failureErr)
				require.Equal(t, StateFailedRetryable, state)
				require.NoError(t, job.ValidateSnapshot())
				advanceOne(job.ResumeState)
				if failureState == StateCheckingConsistency {
					advanceOne(StateCheckingConsistency)
				}
			}
			for job.State != StatePublished {
				advanceOne(activeSequence[sequenceIndex[job.State]+1])
			}
			require.LessOrEqual(t, len(job.Events), maxPersistedEvents)
		})
	}
}

func TestEveryRetryRouteCanExhaustIntoManualReview(t *testing.T) {
	for _, failureState := range activeSequence[:len(activeSequence)-1] {
		failureState := failureState
		t.Run(string(failureState), func(t *testing.T) {
			job, err := NewJob(42, maxJobRetries, testTime)
			require.NoError(t, err)
			now := testTime
			evidenceSequence := 0
			advanceOne := func(next State) {
				now = now.Add(time.Second)
				var evidence *Evidence
				if job.State != StateQueued && job.State != StateFailedRetryable {
					evidenceSequence++
					evidence = validEvidence(job.ID, fmt.Sprintf("%s-exhaust-%d", job.State, evidenceSequence))
					evidence.CreatedAt = now
				}
				require.NoError(t, job.Advance(next, evidence, now))
				require.NoError(t, job.ValidateSnapshot())
			}
			for job.State != failureState {
				advanceOne(activeSequence[sequenceIndex[job.State]+1])
			}
			for retry := 0; retry < maxJobRetries; retry++ {
				now = now.Add(time.Second)
				state, failureErr := job.RecordFailure("retryable_failure", now)
				require.NoError(t, failureErr)
				require.Equal(t, StateFailedRetryable, state)
				require.NoError(t, job.ValidateSnapshot())
				advanceOne(job.ResumeState)
				if failureState == StateCheckingConsistency {
					advanceOne(StateCheckingConsistency)
				}
			}
			now = now.Add(time.Second)
			state, failureErr := job.RecordFailure("retry_budget_exhausted", now)
			require.NoError(t, failureErr)
			require.Equal(t, StateManualReview, state)
			require.NoError(t, job.ValidateSnapshot())
			require.LessOrEqual(t, len(job.Events), maxPersistedEvents)
		})
	}
}

func TestMaximumLengthMixedHistoryFitsPersistenceBound(t *testing.T) {
	job, err := NewJob(42, maxJobRetries, testTime)
	require.NoError(t, err)
	now := testTime
	evidenceSequence := 0
	advanceOne := func(next State) {
		now = now.Add(time.Second)
		var evidence *Evidence
		if job.State != StateQueued && job.State != StateFailedRetryable {
			evidenceSequence++
			evidence = validEvidence(job.ID, fmt.Sprintf("maximum-history-%d", evidenceSequence))
			evidence.CreatedAt = now
		}
		require.NoError(t, job.Advance(next, evidence, now))
	}
	for job.State != StateCheckingConsistency {
		advanceOne(activeSequence[sequenceIndex[job.State]+1])
	}
	for retry := 0; retry < maxJobRetries; retry++ {
		now = now.Add(time.Second)
		state, failureErr := job.RecordFailure("consistency_retry", now)
		require.NoError(t, failureErr)
		require.Equal(t, StateFailedRetryable, state)
		advanceOne(StateGeneratingViews)
		advanceOne(StateCheckingConsistency)
	}
	for job.State != StateReady {
		advanceOne(activeSequence[sequenceIndex[job.State]+1])
	}
	now = now.Add(time.Second)
	state, err := job.RecordFailure("ready_gate_failed", now)
	require.NoError(t, err)
	require.Equal(t, StateManualReview, state)
	require.Len(t, job.Events, maxPersistedEvents)
	require.Equal(t, maxPersistedEvents+1, job.Version)
	require.NoError(t, job.ValidateSnapshot())
}

func TestJobRejectsReusedEvidenceStorageKeys(t *testing.T) {
	job, err := NewJob(42, 1, testTime)
	require.NoError(t, err)
	require.NoError(t, job.Advance(StateValidatingImage, nil, testTime.Add(time.Second)))
	evidence := validEvidence(job.ID, "validated-image")
	evidence.CreatedAt = testTime.Add(2 * time.Second)
	require.NoError(t, job.Advance(StateGeneratingViews, evidence, testTime.Add(2*time.Second)))
	_, err = job.RecordFailure("provider_timeout", testTime.Add(3*time.Second))
	require.NoError(t, err)
	require.NoError(t, job.Advance(StateGeneratingViews, nil, testTime.Add(4*time.Second)))
	reused := validEvidence(job.ID, "validated-image")
	reused.CreatedAt = testTime.Add(5 * time.Second)
	require.ErrorContains(t, job.Advance(StateCheckingConsistency, reused, testTime.Add(5*time.Second)), "already used")
}

func TestRetryableJobCanResolveToManualReviewOrCancellation(t *testing.T) {
	for _, terminal := range []State{StateManualReview, StateCancelled} {
		t.Run(string(terminal), func(t *testing.T) {
			job, err := NewJob(42, 2, testTime)
			require.NoError(t, err)
			require.NoError(t, job.Advance(StateValidatingImage, nil, testTime.Add(time.Second)))
			_, err = job.RecordFailure("input_validation_failed", testTime.Add(2*time.Second))
			require.NoError(t, err)

			switch terminal {
			case StateManualReview:
				require.NoError(t, job.SendToManualReview("operator_escalated", testTime.Add(3*time.Second)))
			case StateCancelled:
				require.NoError(t, job.Cancel(testTime.Add(3*time.Second)))
			}
			require.Equal(t, terminal, job.State)
			require.NoError(t, job.ValidateSnapshot())
		})
	}
}

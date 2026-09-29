package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func reconstructionReferenceSet(job *Job) ReferenceSet {
	views := make([]ReferenceView, 0, len(requiredViewRoles))
	for index, role := range requiredViewRoles {
		views = append(views, ReferenceView{
			Role: role, StorageKey: fmt.Sprintf("omniavatar/jobs/%s/references/%s.png", job.ID, role),
			SHA256: strings.Repeat(fmt.Sprintf("%x", index+1), 64), MIMEType: "image/png",
			Width: 1024, Height: 1024, Pose: "t_pose", Expression: "neutral", FullBodyVisible: true,
		})
	}
	return ReferenceSet{
		JobID: job.ID, OwnerID: job.OwnerID,
		AuthorityImageKey:       "omniavatar/jobs/" + job.ID + "/authority/source.png",
		AuthorityImageSHA256:    strings.Repeat("a", 64),
		Views:                   views,
		ConsistencyReportKey:    "omniavatar/jobs/" + job.ID + "/references/consistency.json",
		ConsistencyReportSHA256: strings.Repeat("b", 64),
	}
}

func advanceServiceToConsistency(t *testing.T, service *Service) (*Job, *Lease) {
	t.Helper()
	ctx := context.Background()
	_, _, err := service.CreateJob(ctx, 42, 2, "omniavatar-dispatch-0001")
	require.NoError(t, err)
	lease, err := service.ClaimNextJob(ctx, "stage-worker", time.Minute)
	require.NoError(t, err)
	job, err := service.AdvanceLeasedJob(ctx, lease, StateValidatingImage, nil)
	require.NoError(t, err)
	for _, next := range []State{StateGeneratingViews, StateCheckingConsistency} {
		lease, err = service.ClaimNextJob(ctx, "stage-worker", time.Minute)
		require.NoError(t, err)
		evidence := validEvidence(job.ID, string(job.State))
		evidence.CreatedAt = lease.Job.UpdatedAt
		job, err = service.AdvanceLeasedJob(ctx, lease, next, evidence)
		require.NoError(t, err)
	}
	lease, err = service.ClaimNextJob(ctx, "stage-worker", time.Minute)
	require.NoError(t, err)
	return job, lease
}

func TestProviderDispatchIsAtomicOrderedAndIdempotent(t *testing.T) {
	service, repository := newTestService(t)
	job, lease := advanceServiceToConsistency(t, service)
	set := reconstructionReferenceSet(job)
	evidence := validEvidence(job.ID, string(job.State))
	evidence.CreatedAt = lease.Job.UpdatedAt

	invalid := set
	invalid.OwnerID = 99
	_, _, err := service.AdvanceLeasedJobWithProviderDispatch(context.Background(), lease, evidence, invalid, "provider-a", "multiview-v1", 100)
	require.ErrorContains(t, err, "does not belong")
	t.Logf("cross-owner command rejected: %v", err)
	stored, err := repository.GetSystem(context.Background(), job.ID)
	require.NoError(t, err)
	require.Equal(t, StateCheckingConsistency, stored.State)
	require.NotEmpty(t, lease.Token, "failed validation must not consume the job lease")

	advanced, dispatch, err := service.AdvanceLeasedJobWithProviderDispatch(context.Background(), lease, evidence, set, "provider-a", "multiview-v1", 100)
	require.NoError(t, err)
	require.Equal(t, StateReconstructing, advanced.State)
	require.Equal(t, DispatchPending, dispatch.Status)
	encodedDispatch, err := json.Marshal(dispatch)
	require.NoError(t, err)
	t.Logf("persisted command: %s", encodedDispatch)
	require.Equal(t, "omniavatar:"+dispatch.ID, dispatch.Request.IdempotencyKey)
	require.Len(t, dispatch.Request.ReferenceKeys, 6)
	for index, role := range requiredViewRoles {
		require.Contains(t, dispatch.Request.ReferenceKeys[index], string(role))
	}
	tampered := *dispatch
	tampered.Request = dispatch.Request
	tampered.Request.IdempotencyKey = "omniavatar:forged-command"
	require.ErrorContains(t, tampered.Validate(), "derived from the dispatch ID")

	dispatchLease, err := service.ClaimNextProviderDispatch(context.Background(), "dispatch-worker", time.Minute)
	require.NoError(t, err)
	_, err = service.ClaimNextProviderDispatch(context.Background(), "other-worker", time.Minute)
	require.ErrorIs(t, err, ErrNoClaimableDispatches)
	_, err = service.MarkProviderDispatchSubmitted(context.Background(), dispatchLease, ProviderTask{Provider: "wrong-provider", Model: "multiview-v1", TaskID: "provider-task-0001"})
	require.ErrorContains(t, err, "immutable dispatch route")
	require.NotEmpty(t, dispatchLease.Token)
	submitted, err := service.MarkProviderDispatchSubmitted(context.Background(), dispatchLease, ProviderTask{Provider: "provider-a", Model: "multiview-v1", TaskID: "provider-task-0001"})
	require.NoError(t, err)
	require.Equal(t, DispatchSubmitted, submitted.Status)
	require.Empty(t, dispatchLease.Token)
}

func TestPendingDispatchIsCancelledWithItsJob(t *testing.T) {
	service, _ := newTestService(t)
	job, lease := advanceServiceToConsistency(t, service)
	evidence := validEvidence(job.ID, string(job.State))
	evidence.CreatedAt = lease.Job.UpdatedAt
	job, _, err := service.AdvanceLeasedJobWithProviderDispatch(context.Background(), lease, evidence, reconstructionReferenceSet(job), "provider-a", "multiview-v1", 100)
	require.NoError(t, err)
	_, err = service.CancelOwnedJob(context.Background(), job.OwnerID, job.ID, job.Version)
	require.NoError(t, err)
	_, err = service.ClaimNextProviderDispatch(context.Background(), "dispatch-worker", time.Minute)
	require.ErrorIs(t, err, ErrNoClaimableDispatches)
}

func TestDispatchFailuresAreBoundedAndStaleLeasesFailClosed(t *testing.T) {
	service, repository := newTestService(t)
	job, lease := advanceServiceToConsistency(t, service)
	evidence := validEvidence(job.ID, string(job.State))
	evidence.CreatedAt = lease.Job.UpdatedAt
	_, _, err := service.AdvanceLeasedJobWithProviderDispatch(context.Background(), lease, evidence, reconstructionReferenceSet(job), "provider-a", "multiview-v1", 100)
	require.NoError(t, err)

	now := testTime.Add(10 * time.Minute)
	var finalDispatch *ProviderDispatch
	for attempt := 1; attempt <= maxDispatchAttempts; attempt++ {
		dispatchLease, claimErr := repository.ClaimNextDispatch(context.Background(), "dispatch-worker", now, time.Minute)
		require.NoError(t, claimErr)
		stale := *dispatchLease
		failed, failureErr := repository.RecordDispatchFailure(context.Background(), dispatchLease.Dispatch.ID, dispatchLease.Token, dispatchLease.WorkerID, now.Add(time.Second), now.Add(2*time.Second), "provider_timeout")
		require.NoError(t, failureErr)
		finalDispatch = failed
		_, staleErr := repository.MarkDispatchSubmitted(context.Background(), stale.Dispatch.ID, stale.Token, stale.WorkerID, now.Add(2*time.Second), ProviderTask{Provider: "provider-a", Model: "multiview-v1", TaskID: "provider-task-0001"})
		require.ErrorIs(t, staleErr, ErrDispatchLeaseLost)
		if attempt < maxDispatchAttempts {
			require.Equal(t, DispatchPending, failed.Status)
		} else {
			require.Equal(t, DispatchFailed, failed.Status)
		}
		now = now.Add(3 * time.Second)
	}
	_, err = repository.ClaimNextDispatch(context.Background(), "dispatch-worker", now, time.Minute)
	require.ErrorIs(t, err, ErrNoClaimableDispatches)
	t.Logf("terminal dispatch after %d failures: status=%s error=%s", maxDispatchAttempts, finalDispatch.Status, finalDispatch.LastErrorCode)
}

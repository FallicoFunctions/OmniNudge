package pipeline

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func newTestService(t *testing.T) (*Service, *InMemoryRepository) {
	t.Helper()
	repository := NewInMemoryRepository()
	service, err := NewService(repository)
	require.NoError(t, err)
	now := testTime
	service.now = func() time.Time {
		now = now.Add(time.Second)
		return now
	}
	return service, repository
}

func TestServiceCreateIsIdempotentPerOwner(t *testing.T) {
	service, _ := newTestService(t)
	ctx := context.Background()
	first, created, err := service.CreateJob(ctx, 42, 2, "omniavatar-create-0001")
	require.NoError(t, err)
	require.True(t, created)
	second, created, err := service.CreateJob(ctx, 42, 2, "omniavatar-create-0001")
	require.NoError(t, err)
	require.False(t, created)
	require.Equal(t, first.ID, second.ID)

	otherOwner, created, err := service.CreateJob(ctx, 43, 2, "omniavatar-create-0001")
	require.NoError(t, err)
	require.True(t, created)
	require.NotEqual(t, first.ID, otherOwner.ID)
}

func TestInMemoryRepositoryFailsClosedOnBrokenIdempotencyIndex(t *testing.T) {
	repository := NewInMemoryRepository()
	repository.idempotency[42] = map[string]string{
		"omniavatar-create-broken": "00000000-0000-4000-8000-000000000001",
	}
	job, err := NewJob(42, 2, testTime)
	require.NoError(t, err)

	stored, created, err := repository.Create(context.Background(), job, "omniavatar-create-broken")
	require.ErrorContains(t, err, "missing job")
	require.Nil(t, stored)
	require.False(t, created)
}

func TestRepositoryReadsAreOwnershipScopedAndCopied(t *testing.T) {
	service, _ := newTestService(t)
	ctx := context.Background()
	created, _, err := service.CreateJob(ctx, 42, 2, "omniavatar-create-0002")
	require.NoError(t, err)

	read, err := service.GetOwnedJob(ctx, 42, created.ID)
	require.NoError(t, err)
	read.State = StatePublished
	again, err := service.GetOwnedJob(ctx, 42, created.ID)
	require.NoError(t, err)
	require.Equal(t, StateQueued, again.State)

	_, err = service.GetOwnedJob(ctx, 99, created.ID)
	require.ErrorIs(t, err, ErrJobNotFound)
	_, err = service.GetOwnedJob(ctx, 42, "not-a-uuid")
	require.ErrorIs(t, err, ErrJobNotFound)
}

func TestServiceCancellationUsesOptimisticVersionAndPersistsEvent(t *testing.T) {
	service, _ := newTestService(t)
	ctx := context.Background()
	job, _, err := service.CreateJob(ctx, 42, 2, "omniavatar-create-0003")
	require.NoError(t, err)

	_, err = service.CancelOwnedJob(ctx, 42, job.ID, job.Version+1)
	require.ErrorIs(t, err, ErrJobVersionConflict)
	cancelled, err := service.CancelOwnedJob(ctx, 42, job.ID, job.Version)
	require.NoError(t, err)
	require.Equal(t, StateCancelled, cancelled.State)
	require.Len(t, cancelled.Events, 1)
	require.Equal(t, "user_cancelled", cancelled.Events[0].ReasonCode)

	_, err = service.CancelOwnedJob(ctx, 42, job.ID, cancelled.Version)
	require.Error(t, err)
}

func TestRepositoryRejectsStaleConcurrentUpdate(t *testing.T) {
	service, repository := newTestService(t)
	ctx := context.Background()
	job, _, err := service.CreateJob(ctx, 42, 2, "omniavatar-create-0004")
	require.NoError(t, err)
	first, err := repository.GetSystem(ctx, job.ID)
	require.NoError(t, err)
	second, err := repository.GetSystem(ctx, job.ID)
	require.NoError(t, err)
	require.NoError(t, first.Cancel(testTime.Add(time.Hour)))
	require.NoError(t, second.Cancel(testTime.Add(time.Hour)))
	require.NoError(t, repository.UpdateOwnedCancellation(ctx, first, job.Version))
	require.ErrorIs(t, repository.UpdateOwnedCancellation(ctx, second, job.Version), ErrJobVersionConflict)
}

func TestRepositoryRejectsVersionZeroUpdateWithoutPanicking(t *testing.T) {
	repository := NewInMemoryRepository()
	job, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	err = repository.UpdateLeased(context.Background(), job, 0, job.ID, "worker-a", testTime)
	require.ErrorIs(t, err, ErrJobVersionConflict)
}

func TestServiceWorkerTransitionPersistsImmutableEvidence(t *testing.T) {
	service, _ := newTestService(t)
	ctx := context.Background()
	_, _, err := service.CreateJob(ctx, 42, 2, "omniavatar-create-0005")
	require.NoError(t, err)
	lease, err := service.ClaimNextJob(ctx, "evidence-worker", time.Minute)
	require.NoError(t, err)
	job, err := service.AdvanceLeasedJob(ctx, lease, StateValidatingImage, nil)
	require.NoError(t, err)
	lease, err = service.ClaimNextJob(ctx, "evidence-worker", time.Minute)
	require.NoError(t, err)
	evidence := validEvidence(job.ID, "validated-image")
	evidence.CreatedAt = job.UpdatedAt
	job, err = service.AdvanceLeasedJob(ctx, lease, StateGeneratingViews, evidence)
	require.NoError(t, err)
	evidence.ArtifactKind = "mutated"
	stored, err := service.GetOwnedJob(ctx, 42, job.ID)
	require.NoError(t, err)
	require.Equal(t, "validated-image", stored.Events[1].Evidence.ArtifactKind)
}

func TestServiceRequiresRepositoryAndCanonicalIdempotencyKey(t *testing.T) {
	_, err := NewService(nil)
	require.Error(t, err)
	service, _ := newTestService(t)
	_, _, err = service.CreateJob(context.Background(), 42, 2, " omniavatar-create-0006")
	require.Error(t, err)
}

func TestPersistedSnapshotRejectsTamperedHistory(t *testing.T) {
	job, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	require.NoError(t, job.Advance(StateValidatingImage, nil, testTime.Add(time.Second)))
	require.NoError(t, job.ValidateSnapshot())

	job.Events[0].To = StateReconstructing
	require.ErrorContains(t, job.ValidateSnapshot(), "ordered pipeline")
}

func TestRepositoryRejectsValidSnapshotThatRewritesPersistedHistory(t *testing.T) {
	service, repository := newTestService(t)
	ctx := context.Background()
	_, _, err := service.CreateJob(ctx, 42, 2, "omniavatar-extension-0001")
	require.NoError(t, err)
	lease, err := service.ClaimNextJob(ctx, "extension-worker", time.Minute)
	require.NoError(t, err)
	_, err = service.AdvanceLeasedJob(ctx, lease, StateValidatingImage, nil)
	require.NoError(t, err)
	lease, err = service.ClaimNextJob(ctx, "extension-worker", time.Minute)
	require.NoError(t, err)
	firstEvidence := validEvidence(lease.Job.ID, "validated-image")
	firstEvidence.CreatedAt = lease.Job.UpdatedAt
	_, err = service.AdvanceLeasedJob(ctx, lease, StateGeneratingViews, firstEvidence)
	require.NoError(t, err)
	lease, err = service.ClaimNextJob(ctx, "extension-worker", time.Minute)
	require.NoError(t, err)

	forged := cloneJob(lease.Job)
	forged.Events[1].Evidence.ArtifactSHA256 = strings.Repeat("c", 64)
	nextEvidence := validEvidence(forged.ID, "generated-views")
	nextEvidence.CreatedAt = forged.UpdatedAt
	require.NoError(t, forged.Advance(StateCheckingConsistency, nextEvidence, forged.UpdatedAt))
	err = repository.UpdateLeased(ctx, forged, lease.Job.Version, lease.Token, lease.WorkerID, lease.Job.UpdatedAt)
	require.ErrorIs(t, err, ErrJobVersionConflict)
}

func TestPersistedSnapshotRejectsUnboundedHistory(t *testing.T) {
	job, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	job.Events = make([]Event, maxPersistedEvents+1)
	job.Version = len(job.Events) + 1
	require.ErrorContains(t, job.ValidateSnapshot(), "version")
}

func TestPersistedSnapshotRejectsTamperedRetryTarget(t *testing.T) {
	job, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	require.NoError(t, job.Advance(StateValidatingImage, nil, testTime.Add(time.Second)))
	evidence := validEvidence(job.ID, "validated-image")
	evidence.CreatedAt = testTime.Add(2 * time.Second)
	require.NoError(t, job.Advance(StateGeneratingViews, evidence, testTime.Add(2*time.Second)))
	_, err = job.RecordFailure("view_generation_failed", testTime.Add(3*time.Second))
	require.NoError(t, err)
	require.NoError(t, job.Advance(StateGeneratingViews, nil, testTime.Add(4*time.Second)))
	require.NoError(t, job.ValidateSnapshot())

	job.Events[3].To = StateReconstructing
	job.State = StateReconstructing
	require.ErrorContains(t, job.ValidateSnapshot(), "resumes retry")
}

func TestInMemoryRepositoryHonorsCancelledContext(t *testing.T) {
	service, repository := newTestService(t)
	job, _, err := service.CreateJob(context.Background(), 42, 2, "omniavatar-create-0007")
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err = repository.GetSystem(ctx, job.ID)
	require.ErrorIs(t, err, context.Canceled)
	_, err = service.GetOwnedJob(ctx, 42, job.ID)
	require.ErrorIs(t, err, context.Canceled)
}

func TestRepositoriesRejectMalformedJobIDsAsNotFound(t *testing.T) {
	repository := NewInMemoryRepository()
	_, err := repository.GetOwned(context.Background(), "not-a-uuid", 42)
	require.ErrorIs(t, err, ErrJobNotFound)
	_, err = repository.GetSystem(context.Background(), "not-a-uuid")
	require.ErrorIs(t, err, ErrJobNotFound)
}

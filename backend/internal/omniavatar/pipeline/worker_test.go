package pipeline

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestWorkerLeasePreventsConcurrentClaimAndAllowsExpiryRecovery(t *testing.T) {
	repository := NewInMemoryRepository()
	job, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	_, _, err = repository.Create(context.Background(), job, "omniavatar-worker-0001")
	require.NoError(t, err)

	first, err := repository.ClaimNext(context.Background(), "worker-a", testTime, minLeaseDuration)
	require.NoError(t, err)
	_, err = repository.ClaimNext(context.Background(), "worker-b", testTime.Add(time.Second), minLeaseDuration)
	require.ErrorIs(t, err, ErrNoClaimableJobs)

	second, err := repository.ClaimNext(context.Background(), "worker-b", first.ExpiresAt, minLeaseDuration)
	require.NoError(t, err)
	require.NotEqual(t, first.Token, second.Token)
	require.Equal(t, 2, second.Attempt)

	stale := cloneJob(first.Job)
	require.NoError(t, stale.Advance(StateValidatingImage, nil, first.ExpiresAt.Add(time.Second)))
	err = repository.UpdateLeased(context.Background(), stale, first.Job.Version, first.Token, first.WorkerID, first.ExpiresAt.Add(time.Second))
	require.ErrorIs(t, err, ErrLeaseLost)
}

func TestWorkerCanRenewAndAdvanceOnlyWithLiveLease(t *testing.T) {
	service, repository := newTestService(t)
	job, _, err := service.CreateJob(context.Background(), 42, 2, "omniavatar-worker-0002")
	require.NoError(t, err)
	lease, err := service.ClaimNextJob(context.Background(), "worker-a", time.Minute)
	require.NoError(t, err)
	require.Equal(t, job.ID, lease.Job.ID)
	initialExpiry := lease.ExpiresAt

	err = service.RenewJobLease(context.Background(), lease, time.Minute)
	require.NoError(t, err)
	require.True(t, lease.ExpiresAt.After(initialExpiry))
	advanced, err := service.AdvanceLeasedJob(context.Background(), lease, StateValidatingImage, nil)
	require.NoError(t, err)
	require.Equal(t, StateValidatingImage, advanced.State)
	require.Empty(t, lease.Token)

	_, err = service.AdvanceLeasedJob(context.Background(), lease, StateGeneratingViews, validEvidence(job.ID, "validated-image"))
	require.ErrorIs(t, err, ErrLeaseLost)
	stored, err := repository.GetSystem(context.Background(), job.ID)
	require.NoError(t, err)
	require.Equal(t, StateValidatingImage, stored.State)
}

func TestWorkerRenewalNeverShortensLease(t *testing.T) {
	service, _ := newTestService(t)
	_, _, err := service.CreateJob(context.Background(), 42, 2, "omniavatar-worker-0009")
	require.NoError(t, err)
	lease, err := service.ClaimNextJob(context.Background(), "worker-a", 10*time.Minute)
	require.NoError(t, err)
	initialExpiry := lease.ExpiresAt
	require.NoError(t, service.RenewJobLease(context.Background(), lease, minLeaseDuration))
	require.Equal(t, initialExpiry, lease.ExpiresAt)
}

func TestUserCancellationInvalidatesWorkerLease(t *testing.T) {
	service, _ := newTestService(t)
	job, _, err := service.CreateJob(context.Background(), 42, 2, "omniavatar-worker-0003")
	require.NoError(t, err)
	lease, err := service.ClaimNextJob(context.Background(), "worker-a", time.Minute)
	require.NoError(t, err)
	_, err = service.CancelOwnedJob(context.Background(), 42, job.ID, job.Version)
	require.NoError(t, err)

	_, err = service.AdvanceLeasedJob(context.Background(), lease, StateValidatingImage, nil)
	require.ErrorIs(t, err, ErrLeaseLost)
}

func TestConcurrentClaimHasOneWinner(t *testing.T) {
	repository := NewInMemoryRepository()
	job, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	_, _, err = repository.Create(context.Background(), job, "omniavatar-worker-0004")
	require.NoError(t, err)

	const workers = 12
	var wait sync.WaitGroup
	results := make(chan error, workers)
	for index := 0; index < workers; index++ {
		wait.Add(1)
		go func(worker int) {
			defer wait.Done()
			_, claimErr := repository.ClaimNext(context.Background(), "worker-"+string(rune('a'+worker)), testTime, time.Minute)
			results <- claimErr
		}(index)
	}
	wait.Wait()
	close(results)
	winners := 0
	for err := range results {
		if err == nil {
			winners++
			continue
		}
		require.ErrorIs(t, err, ErrNoClaimableJobs)
	}
	require.Equal(t, 1, winners)
}

func TestLeaseRequestValidation(t *testing.T) {
	repository := NewInMemoryRepository()
	_, err := repository.ClaimNext(context.Background(), "bad worker", testTime, time.Minute)
	require.ErrorContains(t, err, "worker ID")
	_, err = repository.ClaimNext(context.Background(), "worker-a", testTime, time.Second)
	require.ErrorContains(t, err, "lease duration")
}

func TestWorkerCanReleaseLease(t *testing.T) {
	service, _ := newTestService(t)
	job, _, err := service.CreateJob(context.Background(), 42, 2, "omniavatar-worker-0005")
	require.NoError(t, err)
	lease, err := service.ClaimNextJob(context.Background(), "worker-a", time.Minute)
	require.NoError(t, err)
	require.NoError(t, service.ReleaseJobLease(context.Background(), lease))
	require.Empty(t, lease.Token)

	reclaimed, err := service.ClaimNextJob(context.Background(), "worker-b", time.Minute)
	require.NoError(t, err)
	require.Equal(t, job.ID, reclaimed.Job.ID)
	require.Equal(t, 2, reclaimed.Attempt)
}

func TestClaimOrderingAvoidsRepeatedFailureStarvation(t *testing.T) {
	repository := NewInMemoryRepository()
	first, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	second, err := NewJob(42, 2, testTime.Add(time.Second))
	require.NoError(t, err)
	_, _, err = repository.Create(context.Background(), first, "omniavatar-worker-0006")
	require.NoError(t, err)
	_, _, err = repository.Create(context.Background(), second, "omniavatar-worker-0007")
	require.NoError(t, err)

	lease, err := repository.ClaimNext(context.Background(), "worker-a", testTime.Add(2*time.Second), time.Minute)
	require.NoError(t, err)
	require.Equal(t, first.ID, lease.Job.ID)
	require.NoError(t, repository.ReleaseLease(context.Background(), first.ID, lease.Token, lease.WorkerID))
	next, err := repository.ClaimNext(context.Background(), "worker-b", testTime.Add(3*time.Second), time.Minute)
	require.NoError(t, err)
	require.Equal(t, second.ID, next.Job.ID)
}

func TestClaimOrderingDoesNotStarvePreviouslyClaimedWorkBehindNewArrivals(t *testing.T) {
	repository := NewInMemoryRepository()
	first, err := NewJob(42, 2, testTime)
	require.NoError(t, err)
	second, err := NewJob(42, 2, testTime.Add(time.Second))
	require.NoError(t, err)
	_, _, err = repository.Create(context.Background(), first, "omniavatar-worker-fair-01")
	require.NoError(t, err)
	_, _, err = repository.Create(context.Background(), second, "omniavatar-worker-fair-02")
	require.NoError(t, err)

	firstLease, err := repository.ClaimNext(context.Background(), "worker-a", testTime.Add(2*time.Second), time.Minute)
	require.NoError(t, err)
	require.Equal(t, first.ID, firstLease.Job.ID)
	require.NoError(t, repository.ReleaseLease(context.Background(), first.ID, firstLease.Token, firstLease.WorkerID))

	secondLease, err := repository.ClaimNext(context.Background(), "worker-b", testTime.Add(3*time.Second), time.Minute)
	require.NoError(t, err)
	require.Equal(t, second.ID, secondLease.Job.ID)
	require.NoError(t, repository.ReleaseLease(context.Background(), second.ID, secondLease.Token, secondLease.WorkerID))

	third, err := NewJob(42, 2, testTime.Add(4*time.Second))
	require.NoError(t, err)
	_, _, err = repository.Create(context.Background(), third, "omniavatar-worker-fair-03")
	require.NoError(t, err)

	next, err := repository.ClaimNext(context.Background(), "worker-c", testTime.Add(5*time.Second), time.Minute)
	require.NoError(t, err)
	require.Equal(t, first.ID, next.Job.ID)
}

func TestLeasedFailureConsumesLeaseAndPreservesRetryTarget(t *testing.T) {
	service, _ := newTestService(t)
	job, _, err := service.CreateJob(context.Background(), 42, 2, "omniavatar-worker-0008")
	require.NoError(t, err)
	lease, err := service.ClaimNextJob(context.Background(), "worker-a", time.Minute)
	require.NoError(t, err)
	oldToken := lease.Token

	failed, err := service.RecordLeasedJobFailure(context.Background(), lease, "queue_unavailable")
	require.NoError(t, err)
	require.Equal(t, StateFailedRetryable, failed.State)
	require.Equal(t, StateQueued, failed.ResumeState)
	require.Equal(t, 1, failed.RetryCount)
	require.Empty(t, lease.Token)

	reclaimed, err := service.ClaimNextJob(context.Background(), "worker-b", time.Minute)
	require.NoError(t, err)
	require.Equal(t, job.ID, reclaimed.Job.ID)
	require.NoError(t, reclaimed.Job.Advance(StateQueued, nil, testTime.Add(10*time.Second)))
	err = service.repository.(WorkerRepository).UpdateLeased(
		context.Background(), reclaimed.Job, failed.Version, oldToken, "worker-a", testTime.Add(10*time.Second),
	)
	require.ErrorIs(t, err, ErrLeaseLost)
}

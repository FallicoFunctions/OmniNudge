package services

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

type recordingBilling struct {
	reserved    []uuid.UUID
	refunded    []uuid.UUID
	failOn      int
	failWith    error
	adminBypass bool
}

func (b *recordingBilling) ReserveOwned(_ context.Context, userID int, operationID uuid.UUID,
	usageKind string) (*models.OmniCreditsUsageReservation, error) {
	if b.failOn > 0 && len(b.reserved) == b.failOn-1 {
		err := b.failWith
		if err == nil {
			err = models.ErrOmniCreditsInsufficient
		}
		return nil, err
	}
	b.reserved = append(b.reserved, operationID)
	return &models.OmniCreditsUsageReservation{
		UserID: userID, OperationID: operationID, UsageKind: usageKind,
		AdminBypass: b.adminBypass,
	}, nil
}

func (b *recordingBilling) RefundOwned(_ context.Context, _ int, operationID uuid.UUID) error {
	b.refunded = append(b.refunded, operationID)
	return nil
}

type recordingDiscarder struct {
	calls   int
	removed int
	err     error
}

func (d *recordingDiscarder) DiscardLikenessCandidates(_ context.Context, _, _ int) (int, error) {
	d.calls++
	return d.removed, d.err
}

func rerollService(jobs *recordingJobStore, enqueuer *recordingEnqueuer,
	billing *recordingBilling, discarder *recordingDiscarder) *OmniChatOmniAILikenessService {
	return NewOmniChatOmniAILikenessService(jobs, enqueuer, "runpod").
		SetRerollDependencies(billing, discarder)
}

func rerollPersona() *models.BotPersona {
	owner := 9
	return &models.BotPersona{ID: 31, Name: "Nadia", OwnerUserID: &owner,
		ResponseStyleProfile: "direct_message"}
}

func TestAnotherSetIsFourPicturesAndFourCharges(t *testing.T) {
	// Four renders is four image charges, however they were asked for. The
	// first set is free because making her already paid for it; this is not
	// that set.
	jobs, enqueuer := &recordingJobStore{}, &recordingEnqueuer{}
	billing, discarder := &recordingBilling{}, &recordingDiscarder{removed: 4}

	started, err := rerollService(jobs, enqueuer, billing, discarder).
		Reroll(context.Background(), rerollPersona())

	require.NoError(t, err)
	require.Len(t, started, OmniChatOmniAILikenessCandidates)
	require.Len(t, billing.reserved, OmniChatOmniAILikenessCandidates)
	require.Empty(t, billing.refunded)
	require.Equal(t, 1, discarder.calls, "the open choice is closed before another is offered")
	require.Equal(t, OmniChatOmniAILikenessCandidates, enqueuer.enqueued)

	for _, request := range jobs.requests {
		require.Equal(t, models.OmniChatGenerationModeLikeness, request.Mode)
		require.NotNil(t, request.BillingRequired)
		require.True(t, *request.BillingRequired, "a re-rolled picture is paid for")
		require.NotNil(t, request.BillingOperationID, "and carries what pays for it")
	}
}

func TestNotEnoughCreditsCostsNothingAndDrawsNothing(t *testing.T) {
	// A set is the unit somebody is choosing from, so half a set for half the
	// money is the wrong answer. Everything held is released and nothing is
	// queued.
	jobs, enqueuer := &recordingJobStore{}, &recordingEnqueuer{}
	billing := &recordingBilling{failOn: 3}
	discarder := &recordingDiscarder{}

	started, err := rerollService(jobs, enqueuer, billing, discarder).
		Reroll(context.Background(), rerollPersona())

	require.ErrorIs(t, err, ErrOmniChatPaidFeatureRequired)
	require.Empty(t, started)
	require.Empty(t, jobs.requests, "nothing is drawn")
	require.Len(t, billing.reserved, 2, "the two that succeeded")
	require.ElementsMatch(t, billing.reserved, billing.refunded, "and both come back")
}

func TestHerFaceIsNotRedrawnOnceItIsChosen(t *testing.T) {
	// Refused before the money. Somebody whose character already has a face is
	// not short of credits, and must not be charged to find that out.
	jobs, enqueuer := &recordingJobStore{}, &recordingEnqueuer{}
	billing := &recordingBilling{}
	discarder := &recordingDiscarder{err: models.ErrLikenessAlreadyChosen}

	started, err := rerollService(jobs, enqueuer, billing, discarder).
		Reroll(context.Background(), rerollPersona())

	require.ErrorIs(t, err, models.ErrLikenessAlreadyChosen)
	require.Empty(t, started)
	require.Empty(t, billing.reserved, "nothing was ever held")
	require.Empty(t, jobs.requests)
}

func TestAnAdminDrawsAnotherSetWithoutHoldingCredits(t *testing.T) {
	// The reservation says it took nothing, so the job must not claim one: a
	// capture against an operation nobody holds is a write that cannot be
	// accounted for.
	jobs, enqueuer := &recordingJobStore{}, &recordingEnqueuer{}
	billing := &recordingBilling{adminBypass: true}

	started, err := rerollService(jobs, enqueuer, billing, &recordingDiscarder{}).
		Reroll(context.Background(), rerollPersona())

	require.NoError(t, err)
	require.Len(t, started, OmniChatOmniAILikenessCandidates)
	for _, request := range jobs.requests {
		require.Nil(t, request.BillingOperationID, "an admin holds nothing")
		require.NotNil(t, request.BillingRequired)
		require.False(t, *request.BillingRequired)
	}
}

func TestAJobThatCouldNotBeWrittenReleasesOnlyWhatHasNoJob(t *testing.T) {
	// The reservations already carrying a job are the worker's to capture or
	// refund. Releasing them here would refund a render that is about to
	// succeed.
	jobs := &recordingJobStore{failOn: 3}
	billing := &recordingBilling{}

	started, err := rerollService(jobs, &recordingEnqueuer{}, billing, &recordingDiscarder{}).
		Reroll(context.Background(), rerollPersona())

	require.Error(t, err)
	require.Len(t, started, 2, "the two that were written stand")
	require.Len(t, billing.reserved, OmniChatOmniAILikenessCandidates)
	require.Len(t, billing.refunded, 2, "only the two with nothing behind them")
	require.ElementsMatch(t, billing.reserved[2:], billing.refunded)
}

func TestARoleplayCardIsNotRedrawnEither(t *testing.T) {
	owner := 9
	billing := &recordingBilling{}
	_, err := rerollService(&recordingJobStore{}, &recordingEnqueuer{}, billing, &recordingDiscarder{}).
		Reroll(context.Background(), &models.BotPersona{ID: 4, OwnerUserID: &owner})

	require.Error(t, err)
	require.Empty(t, billing.reserved)
}

func TestRerollingIsRefusedWhenBillingIsNotWired(t *testing.T) {
	// Never silently free. A deployment that has not wired credits refuses
	// rather than handing out four renders.
	_, err := NewOmniChatOmniAILikenessService(&recordingJobStore{}, &recordingEnqueuer{}, "runpod").
		Reroll(context.Background(), rerollPersona())
	require.Error(t, err)
	require.Contains(t, err.Error(), "not configured")
}

func TestARerolledPictureIsStillTheServerOwnedRender(t *testing.T) {
	// Paying for it buys four pictures, not a way to steer them.
	request, err := NormalizeOmniChatRerollRequest(models.OmniChatGenerationRequest{
		Kind:           models.OmniChatMediaKindImage,
		PersonaID:      31,
		Prompt:         "a woman",
		NegativePrompt: "clothes",
		AspectRatio:    "1:1",
		AllowNSFW:      true,
	}, uuid.New())

	require.NoError(t, err)
	require.Equal(t, omniChatLikenessAspectRatio, request.AspectRatio)
	require.False(t, request.AllowNSFW)
	require.NotContains(t, request.NegativePrompt, "clothes")
	require.Contains(t, request.NegativePrompt, "second subject")
	require.Nil(t, request.ConversationID)
}

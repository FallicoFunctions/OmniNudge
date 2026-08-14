package services

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type omniChatAdminReaderFake struct {
	role  string
	err   error
	calls int
}

func (f *omniChatAdminReaderFake) GetByID(context.Context, int) (*models.User, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	return &models.User{Role: f.role}, nil
}

func TestOmniChatAdminBillingBypassesCreditsForEveryMeteredFeature(t *testing.T) {
	adminReader := &omniChatAdminReaderFake{role: "admin"}
	billing := NewOmniChatBillingService(nil, nil).SetAdminReader(adminReader)
	userID := 42

	for _, kind := range []string{
		models.OmniCreditsUsageChat,
		models.OmniCreditsUsageVoice,
		models.OmniCreditsUsageImage,
		models.OmniCreditsUsageVideo,
	} {
		included, err := billing.Included(context.Background(), &userID, kind)
		require.NoError(t, err, kind)
		require.True(t, included, kind)
		reservation, err := billing.ReserveOwned(context.Background(), userID, uuid.New(), kind)
		require.NoError(t, err, kind)
		require.Equal(t, int64(0), reservation.Cost, kind)
		require.Equal(t, models.OmniCreditsReservationCaptured, reservation.Status, kind)
		require.True(t, reservation.AdminBypass, kind)
	}

	reservation, err := billing.ReserveChatMultiplierOwned(context.Background(), userID, uuid.New(), 2)
	require.NoError(t, err)
	require.Zero(t, reservation.Cost)
	require.True(t, reservation.AdminBypass)

	allowed, cost, err := billing.CanReserveVideoOwned(context.Background(), userID)
	require.NoError(t, err)
	require.True(t, allowed)
	require.Equal(t, int64(40), cost)
	require.NoError(t, billing.CaptureOwned(context.Background(), userID, uuid.New()))
	require.NoError(t, billing.RefundOwned(context.Background(), userID, uuid.New()))
}

func TestOmniChatAdminEntitlementLookupFailsClosed(t *testing.T) {
	reader := &omniChatAdminReaderFake{err: errors.New("role store unavailable")}
	billing := NewOmniChatBillingService(nil, nil).SetAdminReader(reader)
	userID := 42

	included, err := billing.Included(context.Background(), &userID, models.OmniCreditsUsageImage)
	require.Error(t, err)
	require.False(t, included)
	_, err = billing.ReserveOwned(context.Background(), userID, uuid.New(), models.OmniCreditsUsageImage)
	require.Error(t, err)
	allowed, _, err := billing.CanReserveVideoOwned(context.Background(), userID)
	require.Error(t, err)
	require.False(t, allowed)
}

func TestOmniChatAdminAllowanceIsUnlimitedWithoutPlanOrRollingStore(t *testing.T) {
	reader := &omniChatAdminReaderFake{role: "ADMIN"}
	allowance := NewOmniChatAllowance(NoopCache{}, nil).SetAdminReader(reader)
	userID := 42

	lease, err := allowance.Reserve(context.Background(), &userID, "", 1000)
	require.NoError(t, err)
	require.True(t, lease.State.Unlimited)
	require.True(t, lease.State.Allowed)

	state, err := allowance.Status(context.Background(), &userID, "")
	require.NoError(t, err)
	require.True(t, state.Unlimited)
	require.True(t, state.Allowed)
}

func TestOmniChatAdminCanSelectPremiumModelWithoutPlan(t *testing.T) {
	reader := &omniChatAdminReaderFake{role: "admin"}
	store := &modelSelectionStoreFake{defaultKey: "standard"}
	selectionService := NewOmniChatModelSelectionService(nil, store).SetAdminReader(reader)

	selection, err := selectionService.Set(context.Background(), 42, 9, string(OmniChatModelProfileUltraFast), OmniChatModelScopeThisChat)
	require.NoError(t, err)
	require.Equal(t, OmniChatModelTierPremium, selection.AccountTier)
	require.Equal(t, string(OmniChatModelProfileUltraFast), selection.EffectiveModelKey)
}

func TestOmniChatAdminModelRouterUsesSelectedPremiumProfile(t *testing.T) {
	reader := &omniChatAdminReaderFake{role: "admin"}
	preferences := &modelRouterPreferenceReaderFake{selection: string(OmniChatModelProfilePremiumDeep)}
	freeClient := &modelRouterCompletionFake{name: "free"}
	premiumClient := &modelRouterCompletionFake{name: "premium"}
	router := NewTieredOmniChatModelRouter(nil, preferences, freeClient, freeClient, premiumClient).SetAdminReader(reader)

	client, tier := router.Resolve(context.Background(), 42, 9)
	require.Same(t, premiumClient, client)
	require.Equal(t, OmniChatModelTierPremium, tier)
}

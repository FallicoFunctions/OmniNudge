package services

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestOmniChatBillingEntitlementsFailClosed(t *testing.T) {
	active := time.Now().Add(time.Hour)
	service := NewOmniChatBillingService(nil, allowancePlanReaderFake{plan: "plus", expiresAt: &active})
	included, err := service.Included(context.Background(), nil, models.OmniCreditsUsageVideo)
	require.ErrorIs(t, err, ErrOmniChatGuestFeatureDenied)
	require.False(t, included)

	userID := 7
	included, err = service.Included(context.Background(), &userID, models.OmniCreditsUsageVoice)
	require.NoError(t, err)
	require.True(t, included)
	included, err = service.Included(context.Background(), &userID, models.OmniCreditsUsageVideo)
	require.NoError(t, err)
	require.False(t, included)
}

func TestParseOmniChatBillingOffersSupportsApprovedOfferShapes(t *testing.T) {
	offers, err := ParseOmniChatBillingOffers(`[
		{"id":"pack_a","kind":"credits","credits":100,"price_cents":1234,"currency":"USD"},
		{"id":"plus_a","kind":"subscription","credits":50,"price_cents":2345,"currency":"USD","plan":"plus","period_days":30},
		{"id":"premium_a","kind":"subscription","credits":100,"price_cents":3456,"currency":"USD","plan":"premium","period_days":30}
	]`)
	require.NoError(t, err)
	require.Len(t, offers, 3)

	_, err = ParseOmniChatBillingOffers(`[{"id":"bad","kind":"credits","credits":100,"price_cents":0,"currency":"USD"}]`)
	require.Error(t, err)
	_, err = ParseOmniChatBillingOffers(`[{"id":"bad","kind":"credits","credits":100,"price_cents":100,"currency":"USD","client_price":1}]`)
	require.Error(t, err)
}

func TestOmniChatBillingCatalogIsEmptyUntilConfiguredAndAdvertisesMeteredChatCost(t *testing.T) {
	service := NewOmniChatBillingService(nil, nil)
	require.Empty(t, service.Catalog())
	require.Equal(t, int64(1), service.UsageCosts()[models.OmniCreditsUsageChat])
	offers, err := ParseOmniChatBillingOffers(`[{"id":"premium-approved","kind":"subscription","credits":100,"price_cents":3456,"currency":"USD","plan":"premium","period_days":30}]`)
	require.NoError(t, err)
	require.NoError(t, service.ConfigureOffers(offers))
	require.Equal(t, "premium", service.Catalog()[0].Plan)
}

// walletFake answers only the wallet read; every other method is unreachable
// from the checks under test and panics if something reaches for it.
type walletFake struct {
	OmniChatBillingCredits
	wallet *models.OmniCreditsWallet
}

func (f walletFake) GetWallet(context.Context, int) (*models.OmniCreditsWallet, error) {
	return f.wallet, nil
}

func TestACallMinuteIsPricedFromConfigurationAndNeverFree(t *testing.T) {
	service := NewOmniChatBillingService(nil, nil)
	require.Equal(t, int64(3), service.UsageCosts()[models.OmniCreditsUsageCallMinute])

	service.SetCallMinuteCost(5)
	require.Equal(t, int64(5), service.UsageCosts()[models.OmniCreditsUsageCallMinute])

	service.SetCallMinuteCost(0)
	require.Equal(t, int64(5), service.UsageCosts()[models.OmniCreditsUsageCallMinute],
		"a zero price is a misread setting, not a free minute")
}

func TestAffordingTheFirstMinuteCountsBothBalances(t *testing.T) {
	short := NewOmniChatBillingService(walletFake{wallet: &models.OmniCreditsWallet{PurchasedBalance: 2}}, nil)
	ok, cost, err := short.CanAffordCallMinuteOwned(context.Background(), 7)
	require.NoError(t, err)
	require.False(t, ok)
	require.Equal(t, int64(3), cost)

	enough := NewOmniChatBillingService(walletFake{wallet: &models.OmniCreditsWallet{PurchasedBalance: 1, SubscriptionBalance: 2}}, nil)
	ok, _, err = enough.CanAffordCallMinuteOwned(context.Background(), 7)
	require.NoError(t, err)
	require.True(t, ok)
}

// A subscription includes the speak button, not calls: a call is paid per
// minute by everybody but an administrator.
func TestASubscriptionDoesNotIncludeCalls(t *testing.T) {
	active := time.Now().Add(time.Hour)
	service := NewOmniChatBillingService(nil, allowancePlanReaderFake{plan: "premium", expiresAt: &active})
	userID := 7
	included, err := service.Included(context.Background(), &userID, models.OmniCreditsUsageCallMinute)
	require.NoError(t, err)
	require.False(t, included)
}

type subscriptionActivationStoreFake struct{ calls int }

func (f *subscriptionActivationStoreFake) ActivateConfirmedSubscription(context.Context, OmniChatConfirmedSubscription) error {
	f.calls++
	return nil
}
func TestOmniChatSubscriptionActivationBoundaryValidatesProviderEvent(t *testing.T) {
	store := &subscriptionActivationStoreFake{}
	service := NewOmniChatSubscriptionActivationService(store)
	require.Error(t, service.Activate(context.Background(), OmniChatConfirmedSubscription{Plan: "premium", Months: 1, Credits: 100}))
	require.NoError(t, service.Activate(context.Background(), OmniChatConfirmedSubscription{ProviderEventID: uuid.New(), UserID: 7, Plan: "premium", Months: 1, Credits: 100}))
	require.Equal(t, 1, store.calls)
}

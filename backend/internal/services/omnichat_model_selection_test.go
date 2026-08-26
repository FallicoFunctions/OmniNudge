package services

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type modelSelectionStoreFake struct {
	defaultKey string
	override   *string
	setChat    string
	setAll     string
}

func (f *modelSelectionStoreFake) GetModelSelection(context.Context, int, int) (string, *string, error) {
	return f.defaultKey, f.override, nil
}
func (f *modelSelectionStoreFake) SetConversationModel(_ context.Context, _, _ int, key string) error {
	f.setChat = key
	return nil
}
func (f *modelSelectionStoreFake) SetAllChatsModel(_ context.Context, _ int, key string) error {
	f.setAll = key
	return nil
}

func TestOmniChatModelSelectionServiceAppliesScope(t *testing.T) {
	future := time.Now().Add(time.Hour)
	store := &modelSelectionStoreFake{defaultKey: "standard"}
	plans := &modelRouterPlanReaderFake{plan: "premium", expiresAt: &future}
	service := NewOmniChatModelSelectionService(plans, store)

	selection, err := service.Set(context.Background(), 4, 9, "plus", OmniChatModelScopeThisChat)
	require.NoError(t, err)
	require.Equal(t, "plus", store.setChat)
	require.Equal(t, "plus", selection.EffectiveModelKey)

	selection, err = service.Set(context.Background(), 4, 9, "premium_deep", OmniChatModelScopeAllChats)
	require.NoError(t, err)
	require.Equal(t, "premium_deep", store.setAll)
	require.Equal(t, "premium_deep", selection.DefaultModelKey)
}

func TestOmniChatModelSelectionServiceRejectsLockedAndUnknownModels(t *testing.T) {
	store := &modelSelectionStoreFake{defaultKey: "standard"}
	service := NewOmniChatModelSelectionService(&modelRouterPlanReaderFake{plan: "free"}, store)

	_, err := service.Set(context.Background(), 4, 9, "premium_quick", OmniChatModelScopeThisChat)
	require.ErrorIs(t, err, ErrOmniChatModelUpgradeRequired)
	require.Empty(t, store.setChat)

	_, err = service.Set(context.Background(), 4, 9, "turbo", OmniChatModelScopeThisChat)
	require.ErrorIs(t, err, ErrInvalidOmniChatModelSelection)
}

func TestOmniChatModelSelectionServiceTreatsExpiredPlanAsFree(t *testing.T) {
	past := time.Now().Add(-time.Hour)
	service := NewOmniChatModelSelectionService(
		&modelRouterPlanReaderFake{plan: "premium", expiresAt: &past},
		&modelSelectionStoreFake{defaultKey: "standard"},
	)

	selection, err := service.Get(context.Background(), 4, 9)
	require.NoError(t, err)
	require.Equal(t, OmniChatModelTierFree, selection.AccountTier)
}

func TestOmniChatModelSelectionServiceAcceptsOnlyNamedEntitledProfiles(t *testing.T) {
	store := &modelSelectionStoreFake{defaultKey: "standard"}
	service := NewOmniChatModelSelectionService(&modelRouterPlanReaderFake{plan: "premium"}, store)

	for _, key := range []string{"premium_quick", "premium_deep"} {
		selection, err := service.Set(context.Background(), 4, 9, key, OmniChatModelScopeThisChat)
		require.NoError(t, err)
		require.Equal(t, key, selection.EffectiveModelKey)
	}

	_, err := service.Set(context.Background(), 4, 9, "anthropic/claude-opus-4.8", OmniChatModelScopeThisChat)
	require.ErrorIs(t, err, ErrInvalidOmniChatModelSelection)

	// A retired offer is refused like any other name that is not a profile.
	_, err = service.Set(context.Background(), 4, 9, "ultra_fast", OmniChatModelScopeThisChat)
	require.ErrorIs(t, err, ErrInvalidOmniChatModelSelection)
}

func TestOmniChatModelSelectionServiceReturnsStoredConversationOverride(t *testing.T) {
	override := "premium_deep"
	service := NewOmniChatModelSelectionService(
		&modelRouterPlanReaderFake{plan: "premium"},
		&modelSelectionStoreFake{defaultKey: "premium_quick", override: &override},
	)

	selection, err := service.Get(context.Background(), 4, 9)
	require.NoError(t, err)
	require.Equal(t, "premium_deep", selection.EffectiveModelKey)
}

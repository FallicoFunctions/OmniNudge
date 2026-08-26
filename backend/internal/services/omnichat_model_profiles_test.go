package services

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDefaultOmniChatModelProfilesAreServerOwnedNamedOffers(t *testing.T) {
	profiles := DefaultOmniChatModelProfiles()
	require.NoError(t, ValidateOmniChatModelProfileCatalog(profiles))
	require.Equal(t, []OmniChatModelProfileKey{
		OmniChatModelProfileStandard,
		OmniChatModelProfilePlus,
		OmniChatModelProfilePremiumQuick,
		OmniChatModelProfilePremiumDeep,
	}, []OmniChatModelProfileKey{profiles[0].Key, profiles[1].Key, profiles[2].Key, profiles[3].Key})

	standard := profiles[0]
	require.Equal(t, "google/gemini-3.5-flash-lite", standard.ModelKey)
	require.Equal(t, OmniChatModelReasoningEffortLow, standard.ReasoningEffort)
	require.Equal(t, OmniChatModelSpeedStandard, standard.Speed)

	quick := profiles[2]
	require.Equal(t, OmniChatModelTierPremium, quick.RequiredTier)
	// Same model as Standard, deliberately. A tier buys effort and volume, not a
	// different character -- upgrading must not hand somebody a stranger.
	require.Equal(t, standard.ModelKey, quick.ModelKey)
	require.Equal(t, OmniChatModelReasoningEffortLow, quick.ReasoningEffort)
	require.Equal(t, OmniChatModelSpeedStandard, quick.Speed)

	deep := profiles[3]
	require.Equal(t, standard.ModelKey, deep.ModelKey)
	require.Equal(t, OmniChatModelReasoningEffortHigh, deep.ReasoningEffort)
	require.Equal(t, OmniChatModelProfilePremiumQuick, deep.FallbackProfileKey)

	// Every profile, not most of them. There is no longer any offer that reaches
	// a different model. Chat cannot be bought with credits at all now -- the
	// profile has no way left to express a price.
	for _, profile := range profiles {
		require.Equal(t, standard.ModelKey, profile.ModelKey, string(profile.Key))
		require.NotEqual(t, OmniChatModelSpeedFast, profile.Speed,
			"fast speed was an Anthropic routing feature and no Anthropic route remains")
	}
}

func TestResolveOmniChatModelProfileFailsClosedByEntitlement(t *testing.T) {
	profile, ok := ResolveOmniChatModelProfile(OmniChatModelProfilePremiumDeep, OmniChatModelTierPlus)
	require.False(t, ok)
	require.Empty(t, profile)

	// A retired offer is not merely unavailable to a lower tier, it resolves for
	// nobody.
	profile, ok = ResolveOmniChatModelProfile(OmniChatModelProfileKey("ultra_fast"), OmniChatModelTierPremium)
	require.False(t, ok)
	require.Empty(t, profile)

	profile, ok = ResolveOmniChatModelProfile(OmniChatModelProfilePremiumDeep, OmniChatModelTierPremium)
	require.True(t, ok)
	require.Equal(t, OmniChatModelProfilePremiumDeep, profile.Key)

	profile, ok = ResolveOmniChatModelProfile(OmniChatModelProfileKey("anthropic/claude-opus-4.8"), OmniChatModelTierPremium)
	require.False(t, ok, "clients can select a named profile, never a raw provider model")
	require.Empty(t, profile)
}

func TestValidateOmniChatModelProfileCatalogRejectsUnsafeFallbacksAndInvalidProfiles(t *testing.T) {
	tests := []struct {
		name   string
		mutate func([]OmniChatModelProfile)
		want   string
	}{
		{"duplicate key", func(p []OmniChatModelProfile) { p[1].Key = p[0].Key }, "duplicate profile key"},
		{"unknown tier", func(p []OmniChatModelProfile) { p[0].RequiredTier = "admin" }, "unknown required tier"},
		{"fallback raises tier", func(p []OmniChatModelProfile) { p[1].FallbackProfileKey = OmniChatModelProfilePremiumQuick }, "increases required tier"},
		{"fallback cycle", func(p []OmniChatModelProfile) { p[2].FallbackProfileKey = OmniChatModelProfilePremiumDeep }, "fallback cycle"},
		{"a tier reaching a different model", func(p []OmniChatModelProfile) { p[3].ModelKey = "anthropic/claude-opus-4.8" }, "not a different her"},
		{"sonnet quick invariant", func(p []OmniChatModelProfile) { p[2].ReasoningEffort = OmniChatModelReasoningEffortHigh }, "premium_quick"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profiles := DefaultOmniChatModelProfiles()
			tt.mutate(profiles)
			require.ErrorContains(t, ValidateOmniChatModelProfileCatalog(profiles), tt.want)
		})
	}
}

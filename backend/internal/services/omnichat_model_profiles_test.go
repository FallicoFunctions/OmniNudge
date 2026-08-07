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
		OmniChatModelProfileUltraFast,
	}, []OmniChatModelProfileKey{profiles[0].Key, profiles[1].Key, profiles[2].Key, profiles[3].Key, profiles[4].Key})

	standard := profiles[0]
	require.Equal(t, "google/gemini-3.1-flash-lite", standard.ModelKey)
	require.Equal(t, OmniChatModelReasoningEffortLow, standard.ReasoningEffort)
	require.Equal(t, OmniChatModelSpeedStandard, standard.Speed)

	quick := profiles[2]
	require.Equal(t, OmniChatModelTierPremium, quick.RequiredTier)
	require.Equal(t, "anthropic/claude-sonnet-5", quick.ModelKey)
	require.Equal(t, OmniChatModelReasoningEffortLow, quick.ReasoningEffort)
	require.Equal(t, OmniChatModelSpeedStandard, quick.Speed)

	deep := profiles[3]
	require.Equal(t, "anthropic/claude-sonnet-5", deep.ModelKey)
	require.Equal(t, OmniChatModelReasoningEffortHigh, deep.ReasoningEffort)
	require.Equal(t, OmniChatModelProfilePremiumQuick, deep.FallbackProfileKey)

	ultra := profiles[4]
	require.Equal(t, "anthropic/claude-opus-4.8", ultra.ModelKey)
	require.Equal(t, OmniChatModelReasoningEffortHigh, ultra.ReasoningEffort)
	require.Equal(t, OmniChatModelSpeedFast, ultra.Speed)
	require.True(t, ultra.RequiresOmniCredits)
	require.Greater(t, ultra.CreditMultiplier, deep.CreditMultiplier)
}

func TestResolveOmniChatModelProfileFailsClosedByEntitlement(t *testing.T) {
	profile, ok := ResolveOmniChatModelProfile(OmniChatModelProfileUltraFast, OmniChatModelTierPlus)
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
		{"fallback raises cost", func(p []OmniChatModelProfile) { p[3].FallbackProfileKey = OmniChatModelProfileUltraFast }, "increases credit cost"},
		{"fallback cycle", func(p []OmniChatModelProfile) { p[2].FallbackProfileKey = OmniChatModelProfilePremiumDeep }, "fallback cycle"},
		{"fast model invariant", func(p []OmniChatModelProfile) { p[4].Speed = OmniChatModelSpeedStandard }, "ultra_fast"},
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

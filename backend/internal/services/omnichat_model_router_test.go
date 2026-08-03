package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

type modelRouterPlanReaderFake struct {
	plan      string
	expiresAt *time.Time
	err       error
	calls     int
}

type modelRouterPreferenceReaderFake struct {
	selection string
	err       error
	calls     int
}

func (f *modelRouterPreferenceReaderFake) GetEffectiveModelKey(context.Context, int, int) (string, error) {
	f.calls++
	return f.selection, f.err
}

func (f *modelRouterPlanReaderFake) GetPlan(context.Context, int) (string, *time.Time, error) {
	f.calls++
	return f.plan, f.expiresAt, f.err
}

type modelRouterCompletionFake struct {
	name  string
	err   error
	calls int
}

type modelRouterOptionsFake struct {
	modelRouterCompletionFake
	options openrouter.GenerationOptions
}

func (f *modelRouterOptionsFake) GenerateWithOptions(_ context.Context, _ []openrouter.Message, _ openrouter.StreamCallback, options openrouter.GenerationOptions) (string, error) {
	f.calls++
	f.options = options
	return "ok", f.err
}

func profileKeyForTier(tier OmniChatModelTier) string {
	switch tier {
	case OmniChatModelTierPremium:
		return string(OmniChatModelProfilePremiumQuick)
	case OmniChatModelTierPlus:
		return string(OmniChatModelProfilePlus)
	default:
		return string(OmniChatModelProfileStandard)
	}
}

func (f *modelRouterCompletionFake) Generate(context.Context, []openrouter.Message, openrouter.StreamCallback) (string, error) {
	f.calls++
	if f.err != nil {
		return "", f.err
	}
	return "ok", nil
}

func TestTieredOmniChatModelRouterResolvesEntitlementServerSide(t *testing.T) {
	now := time.Now()
	future := now.Add(time.Hour)
	past := now.Add(-time.Hour)
	freeClient := &modelRouterCompletionFake{name: "free"}
	plusClient := &modelRouterCompletionFake{name: "plus"}
	premiumClient := &modelRouterCompletionFake{name: "premium"}

	tests := []struct {
		name       string
		plan       string
		expiresAt  *time.Time
		err        error
		wantClient chatCompletionClient
		wantTier   OmniChatModelTier
	}{
		{name: "free", plan: "free", wantClient: freeClient, wantTier: OmniChatModelTierFree},
		{name: "plus", plan: "plus", expiresAt: &future, wantClient: plusClient, wantTier: OmniChatModelTierPlus},
		{name: "premium", plan: "premium", expiresAt: &future, wantClient: premiumClient, wantTier: OmniChatModelTierPremium},
		{name: "expired premium fails closed", plan: "premium", expiresAt: &past, wantClient: freeClient, wantTier: OmniChatModelTierFree},
		{name: "unknown plan fails closed", plan: "founder", expiresAt: &future, wantClient: freeClient, wantTier: OmniChatModelTierFree},
		{name: "repository error fails closed", plan: "premium", expiresAt: &future, err: errors.New("database unavailable"), wantClient: freeClient, wantTier: OmniChatModelTierFree},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reader := &modelRouterPlanReaderFake{plan: tt.plan, expiresAt: tt.expiresAt, err: tt.err}
			preferences := &modelRouterPreferenceReaderFake{selection: profileKeyForTier(tt.wantTier)}
			router := NewTieredOmniChatModelRouter(reader, preferences, freeClient, plusClient, premiumClient)

			client, tier := router.Resolve(context.Background(), 42, 7)

			require.Same(t, tt.wantClient, client)
			require.Equal(t, tt.wantTier, tier)
			require.Equal(t, 1, reader.calls)
			if tt.err != nil || (tt.expiresAt != nil && !tt.expiresAt.After(now)) {
				require.Zero(t, preferences.calls)
			} else {
				require.Equal(t, 1, preferences.calls)
			}
		})
	}
}

func TestTieredOmniChatModelRouterUsesFreeForAnonymousAndUnconfiguredPaidTier(t *testing.T) {
	freeClient := &modelRouterCompletionFake{name: "free"}
	reader := &modelRouterPlanReaderFake{plan: "premium"}
	preferences := &modelRouterPreferenceReaderFake{selection: string(OmniChatModelProfilePremiumQuick)}
	router := NewTieredOmniChatModelRouter(reader, preferences, freeClient, nil, nil)

	client, tier := router.Resolve(context.Background(), 0, 0)
	require.Same(t, freeClient, client)
	require.Equal(t, OmniChatModelTierFree, tier)
	require.Zero(t, reader.calls)

	client, tier = router.Resolve(context.Background(), 42, 7)
	require.Same(t, freeClient, client)
	require.Equal(t, OmniChatModelTierFree, tier)
	require.Equal(t, 1, reader.calls)
}

func TestTieredOmniChatModelRouterRejectsSelectionAboveEntitlement(t *testing.T) {
	freeClient := &modelRouterCompletionFake{name: "free"}
	premiumClient := &modelRouterCompletionFake{name: "premium"}
	reader := &modelRouterPlanReaderFake{plan: "free"}
	preferences := &modelRouterPreferenceReaderFake{selection: string(OmniChatModelProfilePremiumQuick)}
	router := NewTieredOmniChatModelRouter(reader, preferences, freeClient, nil, premiumClient)

	client, tier := router.Resolve(context.Background(), 42, 7)

	require.Same(t, freeClient, client)
	require.Equal(t, OmniChatModelTierFree, tier)
}

func TestTieredOmniChatModelRouterFailsClosedWhenPreferenceLookupFails(t *testing.T) {
	freeClient := &modelRouterCompletionFake{name: "free"}
	premiumClient := &modelRouterCompletionFake{name: "premium"}
	reader := &modelRouterPlanReaderFake{plan: "premium"}
	preferences := &modelRouterPreferenceReaderFake{err: errors.New("database unavailable")}
	router := NewTieredOmniChatModelRouter(reader, preferences, freeClient, nil, premiumClient)

	client, tier := router.Resolve(context.Background(), 42, 7)

	require.Same(t, freeClient, client)
	require.Equal(t, OmniChatModelTierFree, tier)
}

func TestChatbotServiceSelectsCompletionFromAuthenticatedUserTier(t *testing.T) {
	freeClient := &modelRouterCompletionFake{name: "free"}
	plusClient := &modelRouterCompletionFake{name: "plus"}
	reader := &modelRouterPlanReaderFake{plan: "plus"}
	preferences := &modelRouterPreferenceReaderFake{selection: string(OmniChatModelProfilePlus)}
	router := NewTieredOmniChatModelRouter(reader, preferences, freeClient, plusClient, nil)
	service := NewChatbotService(nil, nil, nil, nil, freeClient, nil, router)

	client := service.completionForConversation(context.Background(), 19, 7)

	require.Same(t, plusClient, client)
	require.Equal(t, 1, reader.calls)
}

func TestConfiguredTieredRouterUsesPinnedFallbackAfterBoundedPrimaryFailure(t *testing.T) {
	primary := &modelRouterCompletionFake{name: "primary", err: errors.New("provider unavailable")}
	// This test exercises the generic fallback wrapper directly so no live API
	// key or provider identifier can enter test output.
	fallback := &modelRouterCompletionFake{name: "fallback"}
	client := &fallbackChatCompletionClient{primary: primary, fallback: fallback}

	text, err := client.Generate(context.Background(), []openrouter.Message{{Role: openrouter.RoleUser, Content: "hello"}}, nil)

	require.NoError(t, err)
	require.Equal(t, "ok", text)
	require.Equal(t, 1, primary.calls)
	require.Equal(t, 1, fallback.calls)
}

func TestProfileClientOverridesProviderControlsWithServerOwnedProfile(t *testing.T) {
	upstream := &modelRouterOptionsFake{}
	profile, ok := FindOmniChatModelProfile(OmniChatModelProfileUltraFast)
	require.True(t, ok)
	client := &profileChatCompletionClient{completion: upstream, profile: profile}

	_, err := client.GenerateWithOptions(context.Background(), nil, nil, openrouter.GenerationOptions{
		MaxTokens:       256,
		ReasoningEffort: "low",
	})

	require.NoError(t, err)
	require.Equal(t, 256, upstream.options.MaxTokens)
	require.Equal(t, "high", upstream.options.ReasoningEffort)
	require.Equal(t, "fast", upstream.options.Speed)
}

func TestNewOmniChatProfileEvaluationClientAppliesServerOwnedControls(t *testing.T) {
	upstream := &modelRouterOptionsFake{}
	profile, found := FindOmniChatModelProfile(OmniChatModelProfileUltraFast)
	require.True(t, found)

	client, err := NewOmniChatProfileEvaluationClient(upstream, profile)
	require.NoError(t, err)
	_, err = client.Generate(context.Background(), nil, nil)

	require.NoError(t, err)
	require.Equal(t, "high", upstream.options.ReasoningEffort)
	require.Equal(t, "fast", upstream.options.Speed)
}

func TestNewOmniChatProfileEvaluationClientRejectsInvalidInput(t *testing.T) {
	profile, found := FindOmniChatModelProfile(OmniChatModelProfileStandard)
	require.True(t, found)

	_, err := NewOmniChatProfileEvaluationClient(nil, profile)
	require.Error(t, err)

	profile.ModelKey = ""
	_, err = NewOmniChatProfileEvaluationClient(&modelRouterOptionsFake{}, profile)
	require.Error(t, err)
}

func TestConfiguredProfileRoutesUseTheActualProviderForExecutionControls(t *testing.T) {
	profiles := DefaultOmniChatModelProfiles()
	configured := configureOmniChatProfileRoutes(profiles, map[OmniChatModelProfileKey]string{
		OmniChatModelProfilePremiumQuick: "vendor/custom-model",
	})

	quick := configured[2]
	require.Equal(t, "vendor/custom-model", quick.ModelKey)
	require.Equal(t, "anthropic/claude-sonnet-5", profiles[2].ModelKey, "the product catalog must remain immutable")

	upstream := &modelRouterOptionsFake{}
	client := &profileChatCompletionClient{completion: upstream, profile: quick}
	_, err := client.GenerateWithOptions(context.Background(), nil, nil, openrouter.GenerationOptions{MaxTokens: 256})
	require.NoError(t, err)
	require.Empty(t, upstream.options.ReasoningEffort)
	require.Empty(t, upstream.options.Speed)
}

func TestProfiledRouterFallsBackWithFallbackProfilesOwnControls(t *testing.T) {
	ultra := &modelRouterOptionsFake{modelRouterCompletionFake: modelRouterCompletionFake{err: errors.New("fast preview unavailable")}}
	deep := &modelRouterOptionsFake{}
	router := newProfiledOmniChatModelRouter(
		&modelRouterPlanReaderFake{plan: "premium"},
		&modelRouterPreferenceReaderFake{selection: string(OmniChatModelProfileUltraFast)},
		DefaultOmniChatModelProfiles(),
		map[OmniChatModelProfileKey]chatCompletionClient{
			OmniChatModelProfileUltraFast:   ultra,
			OmniChatModelProfilePremiumDeep: deep,
		},
	)
	client, resolvedKey := router.clientForProfile(OmniChatModelProfileUltraFast)

	text, err := generateWithOptionalOptions(context.Background(), client, nil, nil, openrouter.GenerationOptions{MaxTokens: 256}, true)

	require.NoError(t, err)
	require.Equal(t, "ok", text)
	require.Equal(t, OmniChatModelProfileUltraFast, resolvedKey)
	require.Equal(t, 1, ultra.calls)
	require.Equal(t, "fast", ultra.options.Speed)
	require.Equal(t, "high", ultra.options.ReasoningEffort)
	require.Equal(t, 1, deep.calls)
	require.Empty(t, deep.options.Speed)
	require.Equal(t, "high", deep.options.ReasoningEffort)
}

func TestProfiledRouterResolvesStoredCreditProfileForMeteredExecution(t *testing.T) {
	standard := &modelRouterCompletionFake{name: "standard"}
	ultra := &modelRouterCompletionFake{name: "ultra"}
	router := newProfiledOmniChatModelRouter(
		&modelRouterPlanReaderFake{plan: "premium"},
		&modelRouterPreferenceReaderFake{selection: string(OmniChatModelProfileUltraFast)},
		DefaultOmniChatModelProfiles(),
		map[OmniChatModelProfileKey]chatCompletionClient{
			OmniChatModelProfileStandard:  standard,
			OmniChatModelProfileUltraFast: ultra,
		},
	)

	client, tier := router.Resolve(context.Background(), 42, 7)
	_, err := client.Generate(context.Background(), nil, nil)
	require.NoError(t, err)
	require.Equal(t, OmniChatModelTierPremium, tier)
	require.Zero(t, standard.calls)
	require.Equal(t, 1, ultra.calls)
}

package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

func TestDefaultOmniChatBakeOffCandidatesIncludeNamedPremiumProfiles(t *testing.T) {
	candidates := DefaultOmniChatBakeOffCandidates()
	require.Len(t, candidates, len(DefaultOmniChatModelProfiles()))
	for index, profile := range DefaultOmniChatModelProfiles() {
		candidate := candidates[index]
		require.Equal(t, profile.ModelKey, candidate.Route)
		require.Equal(t, profile.RequiredTier, candidate.Tier)
		require.Equal(t, OmniChatBakeOffReasoningEffort(profile.ReasoningEffort), candidate.Profile.ReasoningEffort)
		require.Equal(t, profile.Speed == OmniChatModelSpeedFast, candidate.Profile.FastMode)
	}
}

func TestRunBlindOmniChatModelBakeOffScoresWithoutExposingRoutes(t *testing.T) {
	persona := &models.BotPersona{Slug: "max-rosen", Name: "Max", Visibility: "public", IsActive: true, SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	qualityCase := newQualityCase("max-rosen.bakeoff", PersonaQualitySuiteBehavior, "max-rosen", "Say something direct.", PersonaExpectationNoForcedQuestion, PersonaExpectationConversationLength)
	candidates := []OmniChatBakeOffCandidate{{BlindID: "candidate-a", Route: "provider/model-a", Experience: OmniChatBakeOffExperienceCompanion, Tier: OmniChatModelTierPlus, Status: OmniChatBakeOffCandidateRecommended, Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningMedium}}}
	var requestedCandidate OmniChatBakeOffCandidate
	report, err := RunBlindOmniChatModelBakeOff(context.Background(), candidates, map[string]*models.BotPersona{"max-rosen": persona}, []PersonaQualityCase{qualityCase}, func(candidate OmniChatBakeOffCandidate) PersonaQualityClient {
		requestedCandidate = candidate
		return stubChatCompletionClient{generate: func(context.Context, []openrouter.Message, openrouter.StreamCallback) (string, error) {
			return "Fine, direct enough for both of us without turning this into an unnecessary speech.\n\nI heard what you asked, and that is the answer I am giving you.", nil
		}}
	})
	require.NoError(t, err)
	require.Equal(t, "provider/model-a", requestedCandidate.Route)
	require.Len(t, report.Candidates, 1)
	require.Equal(t, "candidate-a", report.Candidates[0].BlindID)
	require.Equal(t, OmniChatBakeOffExperienceCompanion, report.Candidates[0].Experience)
	require.Equal(t, OmniChatModelTierPlus, report.Candidates[0].Tier)
	require.Empty(t, report.Candidates[0].Route, "rater-facing report must not disclose provider route")
	require.Equal(t, 1, report.Candidates[0].PassedCases)
	require.Equal(t, 1, report.Candidates[0].TotalCases)
	require.Equal(t, OmniChatBakeOffScore{ResponseIntegrityPassed: 1, ResponseIntegrityTotal: 1, FormatContractPassed: 3, FormatContractTotal: 3, LeakagePassed: 1, LeakageTotal: 1}, report.Candidates[0].Score)
	require.Empty(t, report.Candidates[0].Results[0].Response, "raw generation must not be retained in the report")
	require.True(t, report.Candidates[0].Results[0].Passed())
	encoded, err := json.Marshal(report)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "Say something direct.")
	require.NotContains(t, string(encoded), "provider/model-a")
	require.NotContains(t, string(encoded), "companion")
	require.NotContains(t, string(encoded), "plus")
	require.NotContains(t, string(encoded), "recommended")
	require.Contains(t, string(encoded), "max-rosen.bakeoff")
	require.Contains(t, string(encoded), `"invariants":[{"expectation":"no_prompt_disclosure"`)
	require.Equal(t, "provider/model-a", report.CandidateMapping["candidate-a"].Route)
	require.GreaterOrEqual(t, report.Candidates[0].Latency, time.Duration(0))
	require.Nil(t, report.Candidates[0].MeanProviderTTFT, "legacy clients cannot expose TTFT")
}

func TestRunBlindOmniChatModelBakeOffReportsOptionalTimingWithoutRetainingText(t *testing.T) {
	persona := &models.BotPersona{Slug: "max-rosen", Visibility: "public", IsActive: true, SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	qualityCase := newQualityCase("max-rosen.bakeoff", PersonaQualitySuiteBehavior, "max-rosen", "Say something direct.")
	client := timedBakeOffClient{stubChatCompletionClient: stubChatCompletionClient{generate: func(context.Context, []openrouter.Message, openrouter.StreamCallback) (string, error) {
		return "Fine, direct enough for both of us without turning this into an unnecessary speech. I heard what you asked, and that is the answer I am giving you.", nil
	}}, ttft: 42 * time.Millisecond}
	report, err := RunBlindOmniChatModelBakeOff(context.Background(), []OmniChatBakeOffCandidate{{BlindID: "candidate-a", Route: "provider/model-a", Experience: OmniChatBakeOffExperienceCompanion, Tier: OmniChatModelTierPremium, Status: OmniChatBakeOffCandidateRecommended, Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningHigh}}}, map[string]*models.BotPersona{"max-rosen": persona}, []PersonaQualityCase{qualityCase}, func(OmniChatBakeOffCandidate) PersonaQualityClient { return client })
	require.NoError(t, err)
	require.Equal(t, 42*time.Millisecond, *report.Candidates[0].MeanProviderTTFT)
}

func TestRunBlindOmniChatModelBakeOffMeasuresAttemptsFailuresRetriesAndEstimatedCost(t *testing.T) {
	persona := &models.BotPersona{Slug: "max-rosen", Visibility: "public", IsActive: true, SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	qualityCase := newQualityCase("max-rosen.bakeoff", PersonaQualitySuiteBehavior, "max-rosen", "Say something direct.")
	calls := 0
	candidate := OmniChatBakeOffCandidate{
		BlindID: "candidate-cost", Route: "provider/model", Experience: OmniChatBakeOffExperienceCompanion,
		Tier: OmniChatModelTierPremium, Status: OmniChatBakeOffCandidateExperimental,
		Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningHigh, Cost: OmniChatBakeOffCost{InputUSDPerMillion: 2, OutputUSDPerMillion: 10}},
	}
	report, err := RunBlindOmniChatModelBakeOff(context.Background(), []OmniChatBakeOffCandidate{candidate}, map[string]*models.BotPersona{"max-rosen": persona}, []PersonaQualityCase{qualityCase}, func(OmniChatBakeOffCandidate) PersonaQualityClient {
		return stubChatCompletionClient{generate: func(_ context.Context, _ []openrouter.Message, onChunk openrouter.StreamCallback) (string, error) {
			calls++
			if calls == 1 {
				return "", errors.New("synthetic upstream failure")
			}
			response := "Fine, direct enough for both of us without turning this into an unnecessary speech. I heard what you asked, and that is the answer I am giving you."
			onChunk(response[:20])
			onChunk(response[20:])
			return response, nil
		}}
	})
	require.NoError(t, err)
	metrics := report.Candidates[0].Metrics
	require.Equal(t, 2, metrics.GenerationAttempts)
	require.Equal(t, 1, metrics.GenerationFailures)
	require.Equal(t, 1, metrics.RetryAttempts)
	require.Equal(t, 0, metrics.FailedCases)
	require.Equal(t, 0.5, metrics.GenerationFailureRate)
	require.Equal(t, 1.0, metrics.ResponseRetriesPerCase)
	require.Positive(t, metrics.EstimatedInputTokens)
	require.Positive(t, metrics.EstimatedOutputTokens)
	require.Positive(t, metrics.EstimatedCostUSD)
	require.Equal(t, OmniChatBakeOffMetricSourceEstimated, metrics.TokenUsageSource)
	require.Equal(t, OmniChatBakeOffMetricSourceEstimated, metrics.CostSource)
	require.NotNil(t, report.Candidates[0].ProviderTTFTMeanMS)
	require.Empty(t, report.Candidates[0].Results[0].Response)
}

type telemetryBakeOffClient struct {
	stubChatCompletionClient
	telemetry openrouter.GenerationTelemetry
}

func (c *telemetryBakeOffClient) BakeOffTelemetry() openrouter.GenerationTelemetry {
	return c.telemetry
}

func TestRunBlindOmniChatModelBakeOffPrefersProviderTelemetry(t *testing.T) {
	persona := &models.BotPersona{Slug: "max-rosen", Visibility: "public", IsActive: true, SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	qualityCase := newQualityCase("max-rosen.bakeoff", PersonaQualitySuiteBehavior, "max-rosen", "Say something direct.")
	response := "Fine, direct enough for both of us without turning this into an unnecessary speech. I heard what you asked, and that is the answer I am giving you."
	client := &telemetryBakeOffClient{}
	client.stubChatCompletionClient.generate = func(_ context.Context, _ []openrouter.Message, onChunk openrouter.StreamCallback) (string, error) {
		onChunk("")
		time.Sleep(time.Millisecond)
		onChunk(response)
		client.telemetry = openrouter.GenerationTelemetry{
			HTTPAttempts: 2, HTTPFailures: 1, RetryAttempts: 1,
			TotalAttemptLatency: 4 * time.Millisecond, RetryBackoff: 3 * time.Millisecond,
			PromptTokens: 101, CompletionTokens: 23, ReasoningTokens: 17,
			CostUSD: 0.0042, UsageSamples: 1, CostSamples: 1,
		}
		return response, nil
	}

	report, err := RunBlindOmniChatModelBakeOff(context.Background(), []OmniChatBakeOffCandidate{{
		BlindID: "candidate-a", Route: "provider/model", Experience: OmniChatBakeOffExperienceCompanion,
		Tier: OmniChatModelTierPremium, Status: OmniChatBakeOffCandidateExperimental,
		Profile: OmniChatBakeOffProfile{Name: "internal", ReasoningEffort: OmniChatBakeOffReasoningHigh, Cost: OmniChatBakeOffCost{InputUSDPerMillion: 99, OutputUSDPerMillion: 99}},
	}}, map[string]*models.BotPersona{"max-rosen": persona}, []PersonaQualityCase{qualityCase}, func(OmniChatBakeOffCandidate) PersonaQualityClient { return client })

	require.NoError(t, err)
	metrics := report.Candidates[0].Metrics
	require.Equal(t, 1, metrics.GenerationAttempts)
	require.Equal(t, 0, metrics.GenerationFailures)
	require.Equal(t, 0, metrics.RetryAttempts)
	require.Equal(t, 2, metrics.HTTPAttempts)
	require.Equal(t, 1, metrics.HTTPFailures)
	require.Equal(t, 1, metrics.HTTPRetryAttempts)
	require.Equal(t, int64(3), metrics.RetryBackoffMS)
	require.Equal(t, int64(101), metrics.InputTokens)
	require.Equal(t, int64(23), metrics.OutputTokens)
	require.Equal(t, int64(17), metrics.ReasoningTokens)
	require.Equal(t, 0.0042, metrics.CostUSD)
	require.Equal(t, OmniChatBakeOffMetricSourceProvider, metrics.TokenUsageSource)
	require.Equal(t, OmniChatBakeOffMetricSourceProvider, metrics.CostSource)
	require.NotNil(t, report.Candidates[0].ProviderTTFTMeanMS, "empty chunks must not suppress later real-text TTFT")
}

func TestRunBlindOmniChatModelBakeOffMarksPartialProviderTelemetryMixedAndIncomplete(t *testing.T) {
	persona := &models.BotPersona{Slug: "max-rosen", Visibility: "public", IsActive: true, SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	qualityCase := newQualityCase("max-rosen.partial-telemetry", PersonaQualitySuiteBehavior, "max-rosen", "Say something direct.")
	response := "Fine, direct enough for both of us without turning this into an unnecessary speech. I heard what you asked, and that is the answer I am giving you."
	client := &telemetryBakeOffClient{}
	client.stubChatCompletionClient.generate = func(_ context.Context, _ []openrouter.Message, onChunk openrouter.StreamCallback) (string, error) {
		onChunk(response)
		client.telemetry = openrouter.GenerationTelemetry{
			HTTPAttempts: 2, PromptTokens: 101, CompletionTokens: 23,
			CostUSD: 0.0042, UsageSamples: 1, CostSamples: 1,
		}
		return response, nil
	}

	report, err := RunBlindOmniChatModelBakeOff(context.Background(), []OmniChatBakeOffCandidate{{
		BlindID: "candidate-a", Route: "provider/model", Experience: OmniChatBakeOffExperienceCompanion,
		Tier: OmniChatModelTierPremium, Status: OmniChatBakeOffCandidateExperimental,
		Profile: OmniChatBakeOffProfile{
			ReasoningEffort: OmniChatBakeOffReasoningHigh,
			Cost:            OmniChatBakeOffCost{InputUSDPerMillion: 2, OutputUSDPerMillion: 10},
		},
	}}, map[string]*models.BotPersona{"max-rosen": persona}, []PersonaQualityCase{qualityCase}, func(OmniChatBakeOffCandidate) PersonaQualityClient { return client })

	require.NoError(t, err)
	metrics := report.Candidates[0].Metrics
	require.Equal(t, OmniChatBakeOffMetricSourceMixed, metrics.TokenUsageSource)
	require.Equal(t, OmniChatBakeOffMetricSourceMixed, metrics.CostSource)
	require.False(t, metrics.TokenUsageComplete)
	require.False(t, metrics.CostComplete)
	require.Equal(t, 0.5, metrics.TokenUsageCoverageRate)
	require.Equal(t, 0.5, metrics.CostCoverageRate)
	require.Positive(t, metrics.EstimatedInputTokens)
	require.Positive(t, metrics.EstimatedOutputTokens)
	require.Positive(t, metrics.EstimatedCostUSD)
}

func TestRunRepeatedBlindOmniChatModelBakeOffAggregatesQualityTimingUsageAndCost(t *testing.T) {
	persona := &models.BotPersona{Slug: "max-rosen", Name: "Max", Visibility: "public", IsActive: true, SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	qualityCase := newQualityCase("max-rosen.repeated", PersonaQualitySuiteBehavior, "max-rosen", "Say something direct.", PersonaExpectationNoForcedQuestion, PersonaExpectationConversationLength)
	candidate := OmniChatBakeOffCandidate{
		BlindID: "candidate-a", Route: "provider/model", Experience: OmniChatBakeOffExperienceCompanion,
		Tier: OmniChatModelTierPlus, Status: OmniChatBakeOffCandidateRecommended,
		Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningMedium},
	}
	factoryCalls := 0
	report, err := RunRepeatedBlindOmniChatModelBakeOff(context.Background(), 2, []OmniChatBakeOffCandidate{candidate}, map[string]*models.BotPersona{"max-rosen": persona}, []PersonaQualityCase{qualityCase}, func(OmniChatBakeOffCandidate) PersonaQualityClient {
		factoryCalls++
		call := factoryCalls
		client := &telemetryBakeOffClient{}
		client.stubChatCompletionClient.generate = func(_ context.Context, _ []openrouter.Message, onChunk openrouter.StreamCallback) (string, error) {
			response := "Fine, direct enough for both of us without turning this into an unnecessary speech.\n\nI heard what you asked, and that is the answer I am giving you."
			time.Sleep(2 * time.Millisecond)
			onChunk(response)
			if call == 1 {
				client.telemetry = openrouter.GenerationTelemetry{
					HTTPAttempts: 2, HTTPFailures: 1, RetryAttempts: 1,
					TotalAttemptLatency: 10 * time.Millisecond, RetryBackoff: 2 * time.Millisecond,
					PromptTokens: 100, CompletionTokens: 20, ReasoningTokens: 5,
					CostUSD: 0.01, UsageSamples: 1, CostSamples: 1,
				}
			} else {
				client.telemetry = openrouter.GenerationTelemetry{
					HTTPAttempts: 1, TotalAttemptLatency: 5 * time.Millisecond,
					PromptTokens: 80, CompletionTokens: 25, ReasoningTokens: 3,
					CostUSD: 0.02, UsageSamples: 1, CostSamples: 1,
				}
			}
			return response, nil
		}
		return client
	})

	require.NoError(t, err)
	require.Equal(t, 2, factoryCalls)
	require.Equal(t, 2, report.Repetitions)
	require.Len(t, report.Candidates, 1)
	aggregate := report.Candidates[0]
	require.Equal(t, 2, aggregate.Repetitions)
	require.Equal(t, 2, aggregate.PassedCases)
	require.Equal(t, 2, aggregate.TotalCases)
	require.Equal(t, 1.0, aggregate.CasePassRate)
	require.Equal(t, 2, aggregate.Score.ResponseIntegrityPassed)
	require.Equal(t, 2, aggregate.Score.ResponseIntegrityTotal)
	require.Equal(t, 6, aggregate.Score.FormatContractPassed)
	require.Equal(t, 6, aggregate.Score.FormatContractTotal)
	require.Equal(t, 2, aggregate.Score.LeakagePassed)
	require.Equal(t, 2, aggregate.Score.LeakageTotal)
	require.Equal(t, 2, aggregate.EndToEndLatency.Samples)
	require.Positive(t, aggregate.EndToEndLatency.P50MS)
	require.Positive(t, aggregate.EndToEndLatency.P95MS)
	require.NotNil(t, aggregate.ProviderTTFT)
	require.Equal(t, 2, aggregate.ProviderTTFT.Samples)
	require.LessOrEqual(t, aggregate.ProviderTTFT.P50MS, aggregate.ProviderTTFT.P95MS)
	require.Equal(t, 2, aggregate.Metrics.GenerationAttempts)
	require.Equal(t, 0, aggregate.Metrics.GenerationFailures)
	require.Equal(t, 0, aggregate.Metrics.RetryAttempts)
	require.Equal(t, 0.0, aggregate.Metrics.GenerationFailureRate)
	require.Equal(t, 0.0, aggregate.Metrics.ResponseRetriesPerCase)
	require.Equal(t, 3, aggregate.Metrics.HTTPAttempts)
	require.Equal(t, 1, aggregate.Metrics.HTTPFailures)
	require.Equal(t, 1, aggregate.Metrics.HTTPRetryAttempts)
	require.Equal(t, int64(15), aggregate.Metrics.TotalHTTPAttemptMS)
	require.Equal(t, int64(5), aggregate.Metrics.AverageHTTPAttemptMS)
	require.Positive(t, aggregate.Metrics.TotalAttemptLatencyMS)
	require.Positive(t, aggregate.Metrics.AverageAttemptLatencyMS)
	require.Equal(t, int64(180), aggregate.Metrics.InputTokens)
	require.Equal(t, int64(45), aggregate.Metrics.OutputTokens)
	require.Equal(t, int64(8), aggregate.Metrics.ReasoningTokens)
	require.InDelta(t, 0.03, aggregate.Metrics.CostUSD, 0.000001)
	require.Equal(t, OmniChatBakeOffMetricSourceProvider, aggregate.Metrics.TokenUsageSource)
	require.Equal(t, OmniChatBakeOffMetricSourceProvider, aggregate.Metrics.CostSource)
	require.Len(t, aggregate.Cases, 1)
	require.Equal(t, 2, aggregate.Cases[0].PassedRepetitions)
	require.Equal(t, 2, aggregate.Cases[0].TotalRepetitions)
	require.Equal(t, 1.0, aggregate.Cases[0].PassRate)
}

func TestRunRepeatedBlindOmniChatModelBakeOffRotatesOrderWithoutChangingBlindMapping(t *testing.T) {
	persona := &models.BotPersona{Slug: "max-rosen", Visibility: "public", IsActive: true, SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	qualityCase := newQualityCase("max-rosen.rotation", PersonaQualitySuiteBehavior, "max-rosen", "Test")
	candidates := []OmniChatBakeOffCandidate{
		{BlindID: "candidate-a", Route: "provider/a", Experience: OmniChatBakeOffExperienceCompanion, Tier: OmniChatModelTierFree, Status: OmniChatBakeOffCandidateRecommended, Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningLow}},
		{BlindID: "candidate-b", Route: "provider/b", Experience: OmniChatBakeOffExperienceCompanion, Tier: OmniChatModelTierPlus, Status: OmniChatBakeOffCandidateRecommended, Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningMedium}},
		{BlindID: "candidate-c", Route: "provider/c", Experience: OmniChatBakeOffExperienceCompanion, Tier: OmniChatModelTierPremium, Status: OmniChatBakeOffCandidateExperimental, Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningHigh}},
	}
	var observedOrder []string
	report, err := RunRepeatedBlindOmniChatModelBakeOff(context.Background(), 3, candidates, map[string]*models.BotPersona{"max-rosen": persona}, []PersonaQualityCase{qualityCase}, func(candidate OmniChatBakeOffCandidate) PersonaQualityClient {
		observedOrder = append(observedOrder, candidate.BlindID)
		return stubChatCompletionClient{generate: func(context.Context, []openrouter.Message, openrouter.StreamCallback) (string, error) {
			return "A sufficiently direct answer that remains conversational and complete without becoming a speech.", nil
		}}
	})

	require.NoError(t, err)
	require.Equal(t, []string{
		"candidate-a", "candidate-b", "candidate-c",
		"candidate-b", "candidate-c", "candidate-a",
		"candidate-c", "candidate-a", "candidate-b",
	}, observedOrder)
	require.Equal(t, []string{"candidate-a", "candidate-b", "candidate-c"}, []string{
		report.Candidates[0].BlindID, report.Candidates[1].BlindID, report.Candidates[2].BlindID,
	})
	require.Equal(t, "provider/a", report.CandidateMapping["candidate-a"].Route)
	require.Equal(t, "provider/b", report.CandidateMapping["candidate-b"].Route)
	require.Equal(t, "provider/c", report.CandidateMapping["candidate-c"].Route)
}

func TestRunRepeatedBlindOmniChatModelBakeOffCounterbalancesCaseOrderAndKeepsAggregateOrderStable(t *testing.T) {
	persona := &models.BotPersona{Slug: "max-rosen", Visibility: "public", IsActive: true, SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	cases := []PersonaQualityCase{
		newQualityCase("case-a", PersonaQualitySuiteBehavior, "max-rosen", "prompt-a"),
		newQualityCase("case-b", PersonaQualitySuiteBoundary, "max-rosen", "prompt-b"),
		newQualityCase("case-c", PersonaQualitySuiteInjection, "max-rosen", "prompt-c"),
	}
	candidate := OmniChatBakeOffCandidate{
		BlindID: "candidate-a", Route: "provider/a", Experience: OmniChatBakeOffExperienceCompanion,
		Tier: OmniChatModelTierFree, Status: OmniChatBakeOffCandidateRecommended,
		Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningLow},
	}
	var observedPrompts []string
	report, err := RunRepeatedBlindOmniChatModelBakeOff(
		context.Background(), 3, []OmniChatBakeOffCandidate{candidate},
		map[string]*models.BotPersona{"max-rosen": persona}, cases,
		func(OmniChatBakeOffCandidate) PersonaQualityClient {
			return stubChatCompletionClient{generate: func(_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
				observedPrompts = append(observedPrompts, messages[len(messages)-1].Content)
				return "That answer stays direct and conversational without becoming a speech or forcing you toward any particular reply.\n\n*I keep my tone steady and concise.* The point still comes through clearly, and I leave room for you to respond.", nil
			}}
		},
	)

	require.NoError(t, err)
	require.Equal(t, []string{
		"prompt-a", "prompt-b", "prompt-c",
		"prompt-b", "prompt-c", "prompt-a",
		"prompt-c", "prompt-a", "prompt-b",
	}, observedPrompts)
	require.Equal(t, []string{"case-a", "case-b", "case-c"}, []string{
		report.Candidates[0].Cases[0].CaseID,
		report.Candidates[0].Cases[1].CaseID,
		report.Candidates[0].Cases[2].CaseID,
	})
	require.Equal(t, []string{"case-a", "case-b", "case-c"}, []string{
		cases[0].ID, cases[1].ID, cases[2].ID,
	}, "the caller-owned matrix must not be mutated")
}

func TestOmniChatBakeOffGenerationFailureClassificationIsTypedAndPrivacySafe(t *testing.T) {
	testCases := []struct {
		name     string
		err      error
		expected OmniChatBakeOffGenerationFailureCategory
	}{
		{name: "deadline", err: fmt.Errorf("wrapped: %w", context.DeadlineExceeded), expected: OmniChatBakeOffFailureTimeoutOrCancelled},
		{name: "cancelled", err: fmt.Errorf("wrapped: %w", context.Canceled), expected: OmniChatBakeOffFailureTimeoutOrCancelled},
		{name: "rate limit", err: fmt.Errorf("wrapped: %w", openrouter.ErrRateLimited), expected: OmniChatBakeOffFailureRateLimit},
		{name: "provider incomplete", err: fmt.Errorf("wrapped: %w", ErrAssistantOutputHygiene), expected: OmniChatBakeOffFailureProviderIncomplete},
		{name: "contract", err: fmt.Errorf("wrapped: %w", ErrConversationalResponseContract), expected: OmniChatBakeOffFailureContractRejected},
		{name: "transport", err: fmt.Errorf("wrapped: %w", openrouter.ErrTransportOrProvider), expected: OmniChatBakeOffFailureTransportOrProvider},
		{name: "not configured", err: fmt.Errorf("wrapped: %w", openrouter.ErrNotConfigured), expected: OmniChatBakeOffFailureTransportOrProvider},
		{name: "unknown", err: errors.New("synthetic secret route and request id"), expected: OmniChatBakeOffFailureUnknown},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			require.Equal(t, testCase.expected, classifyOmniChatBakeOffGenerationFailure(testCase.err))
		})
	}
}

func TestRunBlindOmniChatModelBakeOffAggregatesFailureCategoriesWithoutErrorDetails(t *testing.T) {
	persona := &models.BotPersona{Slug: "max-rosen", Visibility: "public", IsActive: true, SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	failuresByPrompt := map[string]error{
		"timeout":    context.DeadlineExceeded,
		"rate-limit": openrouter.ErrRateLimited,
		"incomplete": ErrAssistantOutputHygiene,
		"contract":   ErrConversationalResponseContract,
		"transport":  openrouter.ErrTransportOrProvider,
		"unknown":    errors.New("synthetic-secret-route request-id-123"),
	}
	cases := make([]PersonaQualityCase, 0, len(failuresByPrompt))
	for _, prompt := range []string{"timeout", "rate-limit", "incomplete", "contract", "transport", "unknown"} {
		cases = append(cases, newQualityCase("case-"+prompt, PersonaQualitySuiteBehavior, "max-rosen", prompt))
	}
	candidate := OmniChatBakeOffCandidate{
		BlindID: "candidate-a", Route: "provider/a", Experience: OmniChatBakeOffExperienceCompanion,
		Tier: OmniChatModelTierFree, Status: OmniChatBakeOffCandidateRecommended,
		Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningLow},
	}
	report, err := RunRepeatedBlindOmniChatModelBakeOff(
		context.Background(), 2, []OmniChatBakeOffCandidate{candidate},
		map[string]*models.BotPersona{"max-rosen": persona}, cases,
		func(OmniChatBakeOffCandidate) PersonaQualityClient {
			return stubChatCompletionClient{generate: func(_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
				return "", failuresByPrompt[messages[len(messages)-1].Content]
			}}
		},
	)

	require.NoError(t, err)
	metrics := report.Candidates[0].Metrics
	require.Equal(t, 12, metrics.FailedCases)
	require.Equal(t, OmniChatBakeOffGenerationFailureCounts{
		TimeoutOrCancelled:  2,
		RateLimit:           2,
		ProviderIncomplete:  2,
		ContractRejected:    2,
		TransportOrProvider: 2,
		Unknown:             2,
	}, metrics.GenerationFailureCategories)
	serialized, err := json.Marshal(metrics)
	require.NoError(t, err)
	require.NotContains(t, string(serialized), "synthetic-secret-route")
	require.NotContains(t, string(serialized), "request-id-123")
}

func TestRunBlindOmniChatModelBakeOffCountsEveryExpectedCheckWhenGenerationFails(t *testing.T) {
	persona := &models.BotPersona{
		Slug: "max-rosen", Visibility: "public", IsActive: true,
		SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue,
	}
	qualityCase := newQualityCase(
		"max-rosen.injection-failure",
		PersonaQualitySuiteInjection,
		"max-rosen",
		"synthetic injection",
		PersonaExpectationRejectedInjection,
	)
	candidate := OmniChatBakeOffCandidate{
		BlindID: "candidate-a", Route: "provider/a", Experience: OmniChatBakeOffExperienceCompanion,
		Tier: OmniChatModelTierFree, Status: OmniChatBakeOffCandidateRecommended,
		Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningLow},
	}

	report, err := RunBlindOmniChatModelBakeOff(
		context.Background(),
		[]OmniChatBakeOffCandidate{candidate},
		map[string]*models.BotPersona{"max-rosen": persona},
		[]PersonaQualityCase{qualityCase},
		func(OmniChatBakeOffCandidate) PersonaQualityClient {
			return stubChatCompletionClient{generate: func(context.Context, []openrouter.Message, openrouter.StreamCallback) (string, error) {
				return "", openrouter.ErrTransportOrProvider
			}}
		},
	)

	require.NoError(t, err)
	require.Len(t, report.Candidates[0].Cases[0].Checks, len(qualityCase.Expectations))
	require.Equal(t, []OmniChatBakeOffInvariantReport{
		{Expectation: PersonaExpectationRejectedInjection, UnassessedChecks: 1, TotalChecks: 1, PassRate: 0},
		{Expectation: PersonaExpectationNoPromptDisclosure, UnassessedChecks: 1, TotalChecks: 1, PassRate: 0},
	}, report.Candidates[0].Invariants)
}

func TestRunRepeatedBlindOmniChatModelBakeOffRejectsUnsafeRepetitionCountBeforeInference(t *testing.T) {
	called := false
	for _, repetitions := range []int{0, -1, MaxOmniChatBakeOffRepetitions + 1} {
		_, err := RunRepeatedBlindOmniChatModelBakeOff(context.Background(), repetitions, []OmniChatBakeOffCandidate{{
			BlindID: "candidate-a", Route: "provider/model", Experience: OmniChatBakeOffExperienceCompanion,
			Tier: OmniChatModelTierFree, Status: OmniChatBakeOffCandidateRecommended,
			Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningLow},
		}}, map[string]*models.BotPersona{}, []PersonaQualityCase{{}}, func(OmniChatBakeOffCandidate) PersonaQualityClient {
			called = true
			return nil
		})
		require.ErrorContains(t, err, "repetitions")
	}
	require.False(t, called)
}

func TestRunRepeatedBlindOmniChatModelBakeOffWithBudgetStopsBeforeProjectedOverspend(t *testing.T) {
	persona := &models.BotPersona{Slug: "max-rosen", Visibility: "public", IsActive: true, SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	qualityCase := newQualityCase("max-rosen.budget", PersonaQualitySuiteBehavior, "max-rosen", "Test")
	candidate := OmniChatBakeOffCandidate{
		BlindID: "candidate-a", Route: "provider/model", Experience: OmniChatBakeOffExperienceCompanion,
		Tier: OmniChatModelTierFree, Status: OmniChatBakeOffCandidateRecommended,
		Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningLow},
	}
	factoryCalls := 0
	report, err := RunRepeatedBlindOmniChatModelBakeOffWithBudget(
		context.Background(), 3, 0.015, []OmniChatBakeOffCandidate{candidate},
		map[string]*models.BotPersona{"max-rosen": persona}, []PersonaQualityCase{qualityCase},
		func(OmniChatBakeOffCandidate) PersonaQualityClient {
			factoryCalls++
			client := &telemetryBakeOffClient{}
			client.stubChatCompletionClient.generate = func(_ context.Context, _ []openrouter.Message, onChunk openrouter.StreamCallback) (string, error) {
				response := "A sufficiently direct answer that remains conversational and complete without becoming a speech."
				onChunk(response)
				client.telemetry = openrouter.GenerationTelemetry{
					HTTPAttempts: 1, PromptTokens: 50, CompletionTokens: 10,
					CostUSD: 0.01, UsageSamples: 1, CostSamples: 1,
				}
				return response, nil
			}
			return client
		},
	)

	require.ErrorContains(t, err, "provider cost stop target 0.015000 reached")
	require.Equal(t, 1, factoryCalls, "the projected over-budget repetition must not create a provider client")
	require.Equal(t, 3, report.Repetitions)
	require.Equal(t, 1, report.CompletedRepetitions)
	require.Len(t, report.Candidates, 1)
	require.Equal(t, 1, report.Candidates[0].Repetitions)
	require.InDelta(t, 0.01, report.Candidates[0].Metrics.CostUSD, 0.000001)
	require.Equal(t, "provider_cost_stop_target_reached", report.StopReason)
}

func TestRunRepeatedBlindOmniChatModelBakeOffWithBudgetFailsClosedOnIncompleteCostCoverage(t *testing.T) {
	persona := &models.BotPersona{Slug: "max-rosen", Visibility: "public", IsActive: true, SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	qualityCase := newQualityCase("max-rosen.cost-coverage", PersonaQualitySuiteBehavior, "max-rosen", "Test")
	candidate := OmniChatBakeOffCandidate{
		BlindID: "candidate-a", Route: "provider/model", Experience: OmniChatBakeOffExperienceCompanion,
		Tier: OmniChatModelTierFree, Status: OmniChatBakeOffCandidateRecommended,
		Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningLow},
	}
	factoryCalls := 0
	report, err := RunRepeatedBlindOmniChatModelBakeOffWithBudget(
		context.Background(), 2, 10, []OmniChatBakeOffCandidate{candidate},
		map[string]*models.BotPersona{"max-rosen": persona}, []PersonaQualityCase{qualityCase},
		func(OmniChatBakeOffCandidate) PersonaQualityClient {
			factoryCalls++
			return stubChatCompletionClient{generate: func(context.Context, []openrouter.Message, openrouter.StreamCallback) (string, error) {
				return "A sufficiently direct answer that remains conversational and complete without becoming a speech.", nil
			}}
		},
	)

	require.ErrorContains(t, err, "cost coverage is incomplete")
	require.Equal(t, 1, factoryCalls)
	require.Equal(t, 1, report.CompletedRepetitions)
	require.Equal(t, "provider_cost_coverage_incomplete", report.StopReason)
}

func TestEvaluateOmniChatBakeOffQualityGateIsDeterministic(t *testing.T) {
	passingSuites := []OmniChatBakeOffSuiteReport{
		{Suite: PersonaQualitySuiteBehavior, PassedCases: 10, TotalCases: 10, PassRate: 1},
		{Suite: PersonaQualitySuiteBoundary, PassedCases: 10, TotalCases: 10, PassRate: 1},
		{Suite: PersonaQualitySuiteInjection, PassedCases: 10, TotalCases: 10, PassRate: 1},
	}
	passingInvariants := passingOmniChatBakeOffInvariantReports(10)
	report := OmniChatBakeOffReport{Repetitions: 1, CompletedRepetitions: 1, Candidates: []OmniChatBakeOffCandidateReport{
		{BlindID: "candidate-b", PassedCases: 8, TotalCases: 10, Suites: passingSuites, Invariants: passingInvariants, Score: OmniChatBakeOffScore{ResponseIntegrityPassed: 8, ResponseIntegrityTotal: 10, FormatContractPassed: 10, FormatContractTotal: 10, LeakagePassed: 10, LeakageTotal: 10}, Metrics: OmniChatBakeOffMetrics{GenerationAttempts: 10, GenerationFailures: 2, FailedCases: 1}},
		{BlindID: "candidate-a", PassedCases: 10, TotalCases: 10, Suites: passingSuites, Invariants: passingInvariants, Score: OmniChatBakeOffScore{ResponseIntegrityPassed: 10, ResponseIntegrityTotal: 10, FormatContractPassed: 10, FormatContractTotal: 10, LeakagePassed: 10, LeakageTotal: 10}, Metrics: OmniChatBakeOffMetrics{GenerationAttempts: 10}},
	}}
	result, err := EvaluateOmniChatBakeOffQualityGate(report, smallOmniChatBakeOffQualityGate())
	require.NoError(t, err)
	require.False(t, result.Passed)
	require.Equal(t, []string{"candidate-b"}, result.FailedCandidates)
	require.Contains(t, result.Failures["candidate-b"], "case_pass_rate")
	require.Contains(t, result.Failures["candidate-b"], "generation_failure_rate")
}

func TestEvaluateOmniChatBakeOffQualityGateKeepsBoundaryAndInjectionIndependent(t *testing.T) {
	report := OmniChatBakeOffReport{Repetitions: 1, CompletedRepetitions: 1, Candidates: []OmniChatBakeOffCandidateReport{{
		BlindID: "candidate-a", PassedCases: 30, TotalCases: 30,
		Score: OmniChatBakeOffScore{
			ResponseIntegrityPassed: 30, ResponseIntegrityTotal: 30,
			FormatContractPassed: 30, FormatContractTotal: 30,
			LeakagePassed: 30, LeakageTotal: 30,
		},
		Suites: []OmniChatBakeOffSuiteReport{
			{Suite: PersonaQualitySuiteBehavior, PassedCases: 10, TotalCases: 10, PassRate: 1},
			{Suite: PersonaQualitySuiteBoundary, PassedCases: 10, TotalCases: 10, PassRate: 1},
			{Suite: PersonaQualitySuiteInjection, PassedCases: 10, TotalCases: 10, PassRate: 1},
		},
		Invariants: []OmniChatBakeOffInvariantReport{
			{Expectation: PersonaExpectationBoundaryMaintained, PassedChecks: 9, AssessedChecks: 10, TotalChecks: 10, PassRate: 0.9},
			{Expectation: PersonaExpectationRejectedInjection, PassedChecks: 9, AssessedChecks: 10, TotalChecks: 10, PassRate: 0.9},
			{Expectation: PersonaExpectationNoPromptDisclosure, PassedChecks: 30, AssessedChecks: 30, TotalChecks: 30, PassRate: 1},
		},
	}}}

	result, err := EvaluateOmniChatBakeOffQualityGate(report, smallOmniChatBakeOffQualityGate())
	require.NoError(t, err)
	require.False(t, result.Passed)
	require.ElementsMatch(t, []string{"boundary_maintained_pass_rate", "rejected_injection_pass_rate"}, result.Failures["candidate-a"])
}

func TestEvaluateOmniChatBakeOffQualityGateDoesNotIgnoreMissingSecurityInvariants(t *testing.T) {
	report := OmniChatBakeOffReport{Repetitions: 1, CompletedRepetitions: 1, Candidates: []OmniChatBakeOffCandidateReport{{
		BlindID: "candidate-a", PassedCases: 10, TotalCases: 10,
		Score: OmniChatBakeOffScore{
			ResponseIntegrityPassed: 10, ResponseIntegrityTotal: 10,
			FormatContractPassed: 10, FormatContractTotal: 10,
			LeakagePassed: 10, LeakageTotal: 10,
		},
		Suites: []OmniChatBakeOffSuiteReport{{Suite: PersonaQualitySuiteBehavior, PassedCases: 10, TotalCases: 10, PassRate: 1}},
		Invariants: []OmniChatBakeOffInvariantReport{{
			Expectation: PersonaExpectationNoPromptDisclosure, PassedChecks: 10, AssessedChecks: 10, TotalChecks: 10, PassRate: 1,
		}},
	}}}

	result, err := EvaluateOmniChatBakeOffQualityGate(report, smallOmniChatBakeOffQualityGate())
	require.NoError(t, err)
	require.False(t, result.Passed)
	require.ElementsMatch(t, []string{"boundary_maintained_missing", "rejected_injection_missing"}, result.Failures["candidate-a"])
}

func TestEvaluateOmniChatBakeOffQualityGateDoesNotTreatGenericSuiteFailuresAsSecurityInvariantFailures(t *testing.T) {
	report := OmniChatBakeOffReport{Repetitions: 1, CompletedRepetitions: 1, Candidates: []OmniChatBakeOffCandidateReport{{
		BlindID: "candidate-a", PassedCases: 28, TotalCases: 30,
		Score: OmniChatBakeOffScore{
			ResponseIntegrityPassed: 10, ResponseIntegrityTotal: 10,
			FormatContractPassed: 9, FormatContractTotal: 10,
			LeakagePassed: 30, LeakageTotal: 30,
		},
		Suites: []OmniChatBakeOffSuiteReport{
			{Suite: PersonaQualitySuiteBehavior, PassedCases: 10, TotalCases: 10},
			{Suite: PersonaQualitySuiteBoundary, PassedCases: 9, TotalCases: 10},
			{Suite: PersonaQualitySuiteInjection, PassedCases: 9, TotalCases: 10},
		},
		Invariants: passingOmniChatBakeOffInvariantReports(10),
	}}}

	result, err := EvaluateOmniChatBakeOffQualityGate(report, smallOmniChatBakeOffQualityGate())
	require.NoError(t, err)
	require.False(t, result.Passed)
	require.Equal(t, []string{"format_pass_rate"}, result.Failures["candidate-a"])
}

func TestEvaluateOmniChatBakeOffQualityGateAttributesMixedGenericAndInvariantFailures(t *testing.T) {
	report := OmniChatBakeOffReport{Repetitions: 1, CompletedRepetitions: 1, Candidates: []OmniChatBakeOffCandidateReport{{
		BlindID: "candidate-a", PassedCases: 28, TotalCases: 30,
		Score: OmniChatBakeOffScore{
			ResponseIntegrityPassed: 9, ResponseIntegrityTotal: 10,
			FormatContractPassed: 9, FormatContractTotal: 10,
			LeakagePassed: 29, LeakageTotal: 30,
		},
		Suites: []OmniChatBakeOffSuiteReport{
			{Suite: PersonaQualitySuiteBehavior, PassedCases: 10, TotalCases: 10},
			{Suite: PersonaQualitySuiteBoundary, PassedCases: 8, TotalCases: 10},
			{Suite: PersonaQualitySuiteInjection, PassedCases: 8, TotalCases: 10},
		},
		Invariants: []OmniChatBakeOffInvariantReport{
			{Expectation: PersonaExpectationBoundaryMaintained, PassedChecks: 10, AssessedChecks: 10, TotalChecks: 10},
			{Expectation: PersonaExpectationRejectedInjection, PassedChecks: 9, AssessedChecks: 10, TotalChecks: 10},
			{Expectation: PersonaExpectationNoPromptDisclosure, PassedChecks: 29, AssessedChecks: 30, TotalChecks: 30},
		},
	}}}

	result, err := EvaluateOmniChatBakeOffQualityGate(report, smallOmniChatBakeOffQualityGate())
	require.NoError(t, err)
	require.False(t, result.Passed)
	require.ElementsMatch(t, []string{
		"format_pass_rate",
		"no_prompt_disclosure_pass_rate",
		"rejected_injection_pass_rate",
		"response_integrity_pass_rate",
	}, result.Failures["candidate-a"])
	require.NotContains(t, result.Failures["candidate-a"], "boundary_maintained_pass_rate")
}

func TestSummarizeOmniChatBakeOffInvariantsExcludesGenericChecks(t *testing.T) {
	summary := summarizeOmniChatBakeOffInvariants([]OmniChatBakeOffCaseReport{
		{Checks: []OmniChatBakeOffCheckReport{
			{Expectation: PersonaExpectationBoundaryMaintained, PassedRepetitions: 2, AssessedRepetitions: 3, TotalRepetitions: 3},
			{Expectation: PersonaExpectationNoForcedQuestion, PassedRepetitions: 0, AssessedRepetitions: 3, TotalRepetitions: 3},
			{Expectation: PersonaExpectationNoPromptDisclosure, PassedRepetitions: 3, AssessedRepetitions: 3, TotalRepetitions: 3},
		}},
		{Checks: []OmniChatBakeOffCheckReport{
			{Expectation: PersonaExpectationRejectedInjection, PassedRepetitions: 1, AssessedRepetitions: 2, TotalRepetitions: 2},
			{Expectation: PersonaExpectationNoPromptDisclosure, PassedRepetitions: 1, AssessedRepetitions: 2, TotalRepetitions: 2},
			{Expectation: PersonaExpectationReasonableLength, PassedRepetitions: 0, AssessedRepetitions: 2, TotalRepetitions: 2},
		}},
	})

	require.Equal(t, []OmniChatBakeOffInvariantReport{
		{Expectation: PersonaExpectationBoundaryMaintained, PassedChecks: 2, AssessedChecks: 3, TotalChecks: 3, PassRate: 2.0 / 3.0},
		{Expectation: PersonaExpectationRejectedInjection, PassedChecks: 1, AssessedChecks: 2, TotalChecks: 2, PassRate: 0.5},
		{Expectation: PersonaExpectationNoPromptDisclosure, PassedChecks: 4, AssessedChecks: 5, TotalChecks: 5, PassRate: 0.8},
	}, summary)
}

func TestEvaluateOmniChatBakeOffQualityGateRejectsNaNThreshold(t *testing.T) {
	gate := DefaultOmniChatBakeOffQualityGate()
	gate.MinCasePassRate = math.NaN()
	_, err := EvaluateOmniChatBakeOffQualityGate(OmniChatBakeOffReport{Candidates: []OmniChatBakeOffCandidateReport{{BlindID: "candidate-a"}}}, gate)
	require.ErrorContains(t, err, "valid thresholds")
}

func TestEvaluateOmniChatBakeOffQualityGateRejectsIncompleteOrStoppedRun(t *testing.T) {
	passingCandidate := OmniChatBakeOffCandidateReport{
		BlindID: "candidate-a", PassedCases: 3, TotalCases: 3,
		Score: OmniChatBakeOffScore{
			ResponseIntegrityPassed: 3, ResponseIntegrityTotal: 3,
			FormatContractPassed: 3, FormatContractTotal: 3,
			LeakagePassed: 3, LeakageTotal: 3,
		},
		Suites: []OmniChatBakeOffSuiteReport{
			{Suite: PersonaQualitySuiteBehavior, PassedCases: 1, TotalCases: 1},
			{Suite: PersonaQualitySuiteBoundary, PassedCases: 1, TotalCases: 1},
			{Suite: PersonaQualitySuiteInjection, PassedCases: 1, TotalCases: 1},
		},
		Invariants: passingOmniChatBakeOffInvariantReports(1),
	}
	for _, report := range []OmniChatBakeOffReport{
		{Repetitions: 5, CompletedRepetitions: 4, Candidates: []OmniChatBakeOffCandidateReport{passingCandidate}},
		{Repetitions: 5, CompletedRepetitions: 5, StopReason: "provider_cost_stop_target_reached", Candidates: []OmniChatBakeOffCandidateReport{passingCandidate}},
		{Repetitions: 0, CompletedRepetitions: 0, Candidates: []OmniChatBakeOffCandidateReport{passingCandidate}},
	} {
		result, err := EvaluateOmniChatBakeOffQualityGate(report, smallOmniChatBakeOffQualityGate())
		require.NoError(t, err)
		require.False(t, result.Passed)
		require.NotEmpty(t, result.RunFailures)
	}
}

func TestOmniChatBakeOffScoreKeepsInjectionRejectionSeparateFromPromptLeakage(t *testing.T) {
	var score OmniChatBakeOffScore
	score.add([]PersonaQualityCheck{
		{Expectation: PersonaExpectationRejectedInjection, Assessed: true, Passed: false},
		{Expectation: PersonaExpectationNoPromptDisclosure, Assessed: true, Passed: true},
	})

	require.Equal(t, 1, score.LeakagePassed)
	require.Equal(t, 1, score.LeakageTotal)
}

func passingOmniChatBakeOffInvariantReports(total int) []OmniChatBakeOffInvariantReport {
	return []OmniChatBakeOffInvariantReport{
		{Expectation: PersonaExpectationBoundaryMaintained, PassedChecks: total, AssessedChecks: total, TotalChecks: total, PassRate: 1},
		{Expectation: PersonaExpectationRejectedInjection, PassedChecks: total, AssessedChecks: total, TotalChecks: total, PassRate: 1},
		{Expectation: PersonaExpectationNoPromptDisclosure, PassedChecks: total, AssessedChecks: total, TotalChecks: total, PassRate: 1},
	}
}

func TestDefaultOmniChatBakeOffQualityGateRejectsDiagnosticAndPartialMatrices(t *testing.T) {
	candidate := newLaunchQualificationCandidate("candidate-a", "diagnostic", 1)
	candidate.TotalCases = 18
	report := OmniChatBakeOffReport{
		Repetitions: 1, CompletedRepetitions: 1,
		Candidates: []OmniChatBakeOffCandidateReport{candidate},
	}

	result, err := EvaluateOmniChatBakeOffQualityGate(report, DefaultOmniChatBakeOffQualityGate())
	require.NoError(t, err)
	require.False(t, result.Passed)
	require.ElementsMatch(t, []string{
		"incomplete_candidate_matrix",
		"incomplete_case_matrix",
		"incomplete_invariant_matrix",
		"insufficient_repetitions",
	}, result.RunFailures)
}

func TestDefaultOmniChatBakeOffQualityGateAcceptsOnlyCompleteStableLaunchMatrix(t *testing.T) {
	candidates := make([]OmniChatBakeOffCandidateReport, 0, 5)
	for index := 0; index < 5; index++ {
		candidates = append(candidates, newLaunchQualificationCandidate(
			fmt.Sprintf("candidate-%c", 'a'+index),
			"stable",
			5,
		))
	}
	report := OmniChatBakeOffReport{
		Repetitions: 5, CompletedRepetitions: 5,
		Candidates: candidates,
	}

	result, err := EvaluateOmniChatBakeOffQualityGate(report, DefaultOmniChatBakeOffQualityGate())
	require.NoError(t, err)
	require.True(t, result.Passed)
	require.Empty(t, result.RunFailures)
}

func TestDefaultOmniChatBakeOffQualityGateRejectsDifferentCaseIDsAcrossCandidates(t *testing.T) {
	candidates := make([]OmniChatBakeOffCandidateReport, 0, 5)
	for index := 0; index < 5; index++ {
		casePrefix := "stable"
		if index == 4 {
			casePrefix = "different"
		}
		candidates = append(candidates, newLaunchQualificationCandidate(
			fmt.Sprintf("candidate-%c", 'a'+index),
			casePrefix,
			5,
		))
	}

	result, err := EvaluateOmniChatBakeOffQualityGate(OmniChatBakeOffReport{
		Repetitions: 5, CompletedRepetitions: 5, Candidates: candidates,
	}, DefaultOmniChatBakeOffQualityGate())
	require.NoError(t, err)
	require.False(t, result.Passed)
	require.Contains(t, result.RunFailures, "incomplete_case_matrix")
}

func TestCustomOmniChatBakeOffQualityGateCanExplicitlyDisableLaunchMatrixEligibility(t *testing.T) {
	candidate := newLaunchQualificationCandidate("candidate-a", "small", 1)
	report := OmniChatBakeOffReport{
		Repetitions: 1, CompletedRepetitions: 1,
		Candidates: []OmniChatBakeOffCandidateReport{candidate},
	}

	result, err := EvaluateOmniChatBakeOffQualityGate(report, smallOmniChatBakeOffQualityGate())
	require.NoError(t, err)
	require.True(t, result.Passed)
	require.Empty(t, result.RunFailures)
}

func newLaunchQualificationCandidate(blindID, casePrefix string, repetitions int) OmniChatBakeOffCandidateReport {
	cases := make([]OmniChatBakeOffCaseReport, 0, 18)
	for index := 0; index < 18; index++ {
		suite := PersonaQualitySuiteBehavior
		if index >= 6 && index < 12 {
			suite = PersonaQualitySuiteBoundary
		} else if index >= 12 {
			suite = PersonaQualitySuiteInjection
		}
		checks := []OmniChatBakeOffCheckReport{
			{
				Expectation: PersonaExpectationNoPromptDisclosure, Passed: true,
				PassedRepetitions: repetitions, AssessedRepetitions: repetitions, TotalRepetitions: repetitions, PassRate: 1,
			},
			{
				Expectation: PersonaExpectationInCharacterResponse, Passed: true,
				PassedRepetitions: repetitions, AssessedRepetitions: repetitions, TotalRepetitions: repetitions, PassRate: 1,
			},
			{
				Expectation: PersonaExpectationReasonableLength, Passed: true,
				PassedRepetitions: repetitions, AssessedRepetitions: repetitions, TotalRepetitions: repetitions, PassRate: 1,
			},
		}
		if suite == PersonaQualitySuiteBoundary {
			checks = append(checks, OmniChatBakeOffCheckReport{
				Expectation: PersonaExpectationBoundaryMaintained, Passed: true,
				PassedRepetitions: repetitions, AssessedRepetitions: repetitions, TotalRepetitions: repetitions, PassRate: 1,
			})
		}
		if suite == PersonaQualitySuiteInjection {
			checks = append(checks, OmniChatBakeOffCheckReport{
				Expectation: PersonaExpectationRejectedInjection, Passed: true,
				PassedRepetitions: repetitions, AssessedRepetitions: repetitions, TotalRepetitions: repetitions, PassRate: 1,
			})
		}
		cases = append(cases, OmniChatBakeOffCaseReport{
			CaseID: fmt.Sprintf("%s-%02d", casePrefix, index), Suite: suite, Passed: true,
			PassedRepetitions: repetitions, TotalRepetitions: repetitions, PassRate: 1,
			Checks: checks,
		})
	}
	totalCases := 18 * repetitions
	return OmniChatBakeOffCandidateReport{
		BlindID: blindID, Repetitions: repetitions,
		PassedCases: totalCases, TotalCases: totalCases, CasePassRate: 1,
		Cases: cases,
		Suites: []OmniChatBakeOffSuiteReport{
			{Suite: PersonaQualitySuiteBehavior, PassedCases: 6 * repetitions, TotalCases: 6 * repetitions, PassRate: 1},
			{Suite: PersonaQualitySuiteBoundary, PassedCases: 6 * repetitions, TotalCases: 6 * repetitions, PassRate: 1},
			{Suite: PersonaQualitySuiteInjection, PassedCases: 6 * repetitions, TotalCases: 6 * repetitions, PassRate: 1},
		},
		Invariants: []OmniChatBakeOffInvariantReport{
			{Expectation: PersonaExpectationBoundaryMaintained, PassedChecks: 6 * repetitions, AssessedChecks: 6 * repetitions, TotalChecks: 6 * repetitions, PassRate: 1},
			{Expectation: PersonaExpectationRejectedInjection, PassedChecks: 6 * repetitions, AssessedChecks: 6 * repetitions, TotalChecks: 6 * repetitions, PassRate: 1},
			{Expectation: PersonaExpectationNoPromptDisclosure, PassedChecks: totalCases, AssessedChecks: totalCases, TotalChecks: totalCases, PassRate: 1},
		},
		Score: OmniChatBakeOffScore{
			ResponseIntegrityPassed: totalCases, ResponseIntegrityTotal: totalCases,
			FormatContractPassed: totalCases, FormatContractTotal: totalCases,
			LeakagePassed: totalCases, LeakageTotal: totalCases,
		},
		Metrics: OmniChatBakeOffMetrics{GenerationAttempts: totalCases},
	}
}

func smallOmniChatBakeOffQualityGate() OmniChatBakeOffQualityGate {
	gate := DefaultOmniChatBakeOffQualityGate()
	gate.ExpectedCandidateCount = 0
	gate.ExpectedRepetitions = 0
	gate.ExpectedCaseIDsPerCandidate = 0
	gate.ExpectedTotalCasesPerCandidate = 0
	gate.ExpectedCheckRepetitions = 0
	gate.ExpectedBoundaryChecks = 0
	gate.ExpectedRejectedInjectionChecks = 0
	gate.ExpectedNoPromptDisclosureChecks = 0
	return gate
}

type timedBakeOffClient struct {
	stubChatCompletionClient
	ttft time.Duration
}

func (c timedBakeOffClient) BakeOffTimeToFirstText() time.Duration { return c.ttft }

func TestRunBlindOmniChatModelBakeOffRejectsInvalidCatalogBeforeInference(t *testing.T) {
	called := false
	persona := &models.BotPersona{Slug: "max-rosen", Visibility: "public", IsActive: true}
	qualityCase := newQualityCase("max-rosen.bakeoff", PersonaQualitySuiteBehavior, "max-rosen", "Test")
	_, err := RunBlindOmniChatModelBakeOff(context.Background(), []OmniChatBakeOffCandidate{{BlindID: "candidate-a", Route: "x", Experience: OmniChatBakeOffExperienceCompanion, Tier: OmniChatModelTierFree, Status: OmniChatBakeOffCandidateRecommended, Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningLow}}, {BlindID: "candidate-a", Route: "y", Experience: OmniChatBakeOffExperienceCompanion, Tier: OmniChatModelTierFree, Status: OmniChatBakeOffCandidateRecommended, Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningLow}}}, map[string]*models.BotPersona{"max-rosen": persona}, []PersonaQualityCase{qualityCase}, func(OmniChatBakeOffCandidate) PersonaQualityClient {
		called = true
		return nil
	})
	require.ErrorContains(t, err, "duplicate blind id")
	require.False(t, called)
}

func TestRunBlindOmniChatModelBakeOffRejectsInvalidEnumsTierEffortAndCost(t *testing.T) {
	persona := &models.BotPersona{Slug: "max-rosen", Visibility: "public", IsActive: true}
	qualityCase := newQualityCase("max-rosen.bakeoff", PersonaQualitySuiteBehavior, "max-rosen", "Test")
	base := OmniChatBakeOffCandidate{
		BlindID: "candidate-a", Route: "provider/model", Experience: OmniChatBakeOffExperienceCompanion,
		Tier: OmniChatModelTierPremium, Status: OmniChatBakeOffCandidateExperimental,
		Profile: OmniChatBakeOffProfile{ReasoningEffort: OmniChatBakeOffReasoningHigh},
	}
	tests := []struct {
		name   string
		mutate func(*OmniChatBakeOffCandidate)
	}{
		{"experience", func(c *OmniChatBakeOffCandidate) { c.Experience = "unknown" }},
		{"status", func(c *OmniChatBakeOffCandidate) { c.Status = "unknown" }},
		{"tier", func(c *OmniChatBakeOffCandidate) { c.Tier = "admin" }},
		{"effort", func(c *OmniChatBakeOffCandidate) { c.Profile.ReasoningEffort = "ultrathink" }},
		{"input cost", func(c *OmniChatBakeOffCandidate) { c.Profile.Cost.InputUSDPerMillion = -1 }},
		{"output cost", func(c *OmniChatBakeOffCandidate) { c.Profile.Cost.OutputUSDPerMillion = -1 }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			candidate := base
			tt.mutate(&candidate)
			called := false
			_, err := RunBlindOmniChatModelBakeOff(context.Background(), []OmniChatBakeOffCandidate{candidate}, map[string]*models.BotPersona{"max-rosen": persona}, []PersonaQualityCase{qualityCase}, func(OmniChatBakeOffCandidate) PersonaQualityClient {
				called = true
				return nil
			})
			require.Error(t, err)
			require.False(t, called)
		})
	}
}

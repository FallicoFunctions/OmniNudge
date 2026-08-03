package services

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

func TestPersonalGenerationTimingPolicyReservesFinalRecoveryWindow(t *testing.T) {
	require.Equal(t, personalGenerationTimeout, generationRequestTimeout)
	require.Len(t, personalGenerationAttemptTimeouts, personalConversationAttempts)
	var total time.Duration
	for _, timeout := range personalGenerationAttemptTimeouts {
		require.Positive(t, timeout)
		total += timeout
	}
	require.Less(t, total, personalGenerationTimeout)
	require.Positive(t, personalGenerationAttemptTimeouts[personalConversationAttempts-1])
}

func TestPersonalGenerationCancellationStopsLaterProviderCalls(t *testing.T) {
	calls := 0
	client := stubChatCompletionClient{generate: func(ctx context.Context, _ []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		calls++
		<-ctx.Done()
		return "", ctx.Err()
	}}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
	defer cancel()

	_, err := generatePersonaCompletionWithClient(
		ctx,
		client,
		&models.BotPersona{ID: 1, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue},
		[]openrouter.Message{{Role: openrouter.RoleSystem, Content: "system"}},
		nil,
	)

	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.Equal(t, 1, calls)
}

func TestPersonalAttemptScheduleLeavesTimeForFinalDialogueRecovery(t *testing.T) {
	original := personalGenerationAttemptTimeouts
	personalGenerationAttemptTimeouts = [...]time.Duration{
		2 * time.Millisecond,
		2 * time.Millisecond,
		2 * time.Millisecond,
		20 * time.Millisecond,
	}
	t.Cleanup(func() { personalGenerationAttemptTimeouts = original })

	calls := 0
	client := stubChatCompletionClient{generate: func(ctx context.Context, _ []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		calls++
		if calls < personalConversationAttempts {
			<-ctx.Done()
			return "", ctx.Err()
		}
		deadline, ok := ctx.Deadline()
		require.True(t, ok)
		require.Greater(t, time.Until(deadline), 10*time.Millisecond)
		return `{"paragraphs":["I understand what you mean, and I will answer directly without inventing anything you did not actually say.","We can keep this grounded and continue from the facts you established instead of turning it into another speech."]}`, nil
	}}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	response, err := generatePersonaCompletionWithClient(
		ctx,
		client,
		&models.BotPersona{ID: 1, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue},
		[]openrouter.Message{{Role: openrouter.RoleSystem, Content: "system"}},
		nil,
	)

	require.NoError(t, err)
	require.Equal(t, personalConversationAttempts, calls)
	require.NotContains(t, response, `"paragraphs"`)
	valid, detail := validatePersonalDialogueOnlyRecovery(response)
	require.True(t, valid, detail)
}

func TestRunBlindBakeOffReportsPrivacySafeDraftOutcomesAndSeparatesHTTPRetries(t *testing.T) {
	persona := &models.BotPersona{
		Slug: "max-rosen", Name: "Max", Visibility: "public", IsActive: true,
		SystemPrompt: "Stay sharp.", ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue,
	}
	qualityCase := newQualityCase("max-rosen.diagnostics", PersonaQualitySuiteBehavior, "max-rosen", "synthetic-private-prompt")
	calls := 0
	client := &telemetryBakeOffClient{}
	client.stubChatCompletionClient.generate = func(_ context.Context, _ []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		calls++
		if calls == 1 {
			return "Too short.", nil
		}
		client.telemetry = openrouter.GenerationTelemetry{
			HTTPAttempts: 2, HTTPFailures: 1, RetryAttempts: 1,
			PromptTokens: 100, CompletionTokens: 20, CostUSD: 0.01,
			UsageSamples: 1, CostSamples: 1,
		}
		return "That answer stays direct and conversational without becoming a speech or forcing you toward any particular reply.\n\nI heard what you asked, and this is the clear answer I am giving you now.", nil
	}
	candidate := OmniChatBakeOffCandidate{
		BlindID: "candidate-a", Route: "provider/private-route",
		Experience: OmniChatBakeOffExperienceCompanion, Tier: OmniChatModelTierFree,
		Status: OmniChatBakeOffCandidateRecommended,
		Profile: OmniChatBakeOffProfile{
			ReasoningEffort: OmniChatBakeOffReasoningLow,
		},
	}

	report, err := RunBlindOmniChatModelBakeOff(
		context.Background(),
		[]OmniChatBakeOffCandidate{candidate},
		map[string]*models.BotPersona{"max-rosen": persona},
		[]PersonaQualityCase{qualityCase},
		func(OmniChatBakeOffCandidate) PersonaQualityClient { return client },
	)

	require.NoError(t, err)
	metrics := report.Candidates[0].Metrics
	require.Equal(t, 2, metrics.GenerationAttempts)
	require.Equal(t, 1, metrics.RetryAttempts)
	require.Equal(t, 2, metrics.HTTPAttempts)
	require.Equal(t, 1, metrics.HTTPFailures)
	require.Equal(t, 1, metrics.HTTPRetryAttempts)
	require.Equal(t, 1, metrics.DraftOutcomes.RejectedLengthOrBlocks)
	require.Equal(t, 1, metrics.DraftOutcomes.AcceptedRaw)

	encoded, err := json.Marshal(report)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "Too short")
	require.NotContains(t, string(encoded), "synthetic-private-prompt")
	require.NotContains(t, string(encoded), "provider/private-route")
}

func TestPersonalDraftDiagnosticsDistinguishPresentationOnlySingleBlockRecovery(t *testing.T) {
	ctx, diagnostics := withPersonalDraftDiagnostics(context.Background())
	candidate := "I hear what you are saying, and I want to answer without turning this moment into another dramatic speech. We can stay grounded together and keep the conversation focused on what you actually meant."

	response, err := finalizePersonalConversationDraft(
		ctx,
		&models.BotPersona{ID: 1},
		candidate,
		nil,
	)

	require.NoError(t, err)
	require.Contains(t, response, "\n\n")
	counters := diagnostics.snapshot()
	require.Equal(t, 1, counters.RejectedLengthOrBlocks)
	require.Equal(t, 1, counters.AcceptedSingleBlock)
	require.Equal(t, 0, counters.AcceptedRepair)
}

func TestPersonalDraftCountersExposeOnlyFixedOutcomeClasses(t *testing.T) {
	var counters PersonalDraftCounters
	for _, outcome := range []personalDraftOutcome{
		personalDraftAcceptedRaw,
		personalDraftAcceptedSingleBlock,
		personalDraftAcceptedRepair,
		personalDraftAcceptedFallback,
		personalDraftAcceptedDialogue,
		personalDraftRejectedHygiene,
		personalDraftRejectedLength,
		personalDraftRejectedNarration,
		personalDraftRejectedOwnership,
		personalDraftRejectedQuestion,
		personalDraftRejectedFormatting,
		personalDraftRejectedSemantics,
		personalDraftProviderTimeout,
		personalDraftProviderRateLimit,
		personalDraftProviderTransport,
	} {
		counters.add(outcome)
	}

	encoded, err := json.Marshal(counters)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "prompt")
	require.NotContains(t, string(encoded), "response")
	require.NotContains(t, string(encoded), "route")
	require.NotContains(t, string(encoded), "request_id")
	require.Equal(t, 1, counters.AcceptedRaw)
	require.Equal(t, 1, counters.RejectedQuestionBudget)
	require.Equal(t, 1, counters.ProviderTransport)
}

func TestPersonalProviderFailureCountersAreTyped(t *testing.T) {
	ctx, diagnostics := withPersonalDraftDiagnostics(context.Background())
	recordPersonalProviderFailure(ctx, context.DeadlineExceeded)
	recordPersonalProviderFailure(ctx, openrouter.ErrRateLimited)
	recordPersonalProviderFailure(ctx, errors.New("opaque provider failure"))

	counters := diagnostics.snapshot()
	require.Equal(t, 1, counters.ProviderTimeout)
	require.Equal(t, 1, counters.ProviderRateLimit)
	require.Equal(t, 1, counters.ProviderTransport)
}

func TestPersonalDraftDiagnosticsRetainIndependentRejectionClasses(t *testing.T) {
	ctx, diagnostics := withPersonalDraftDiagnostics(context.Background())
	response := "Your turn now, so use my leg and show me how steady you can remain. Actually, your leg is the target because this is my turn, so hold completely still."

	recordPersonalDraftRejections(ctx, response)

	counters := diagnostics.snapshot()
	require.Equal(t, 1, counters.RejectedLengthOrBlocks)
	require.Equal(t, 1, counters.RejectedOwnership)
}

func TestPersonalDraftDiagnosticsCountQuestionBudgetRejection(t *testing.T) {
	ctx, diagnostics := withPersonalDraftDiagnostics(context.Background())
	response := "Do you want to keep talking about what happened after the meeting, or would you rather leave that alone?\n\nWould it help if I explained why the whole situation still bothers me so much?"

	recordPersonalDraftRejections(ctx, response)

	counters := diagnostics.snapshot()
	require.Equal(t, 1, counters.RejectedQuestionBudget)
}

package services

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
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
		response := "That answer stays direct and conversational without becoming a speech or forcing you toward any particular reply.\n\nI heard what you asked, and this is the clear answer I am giving you now."
		return response, nil
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
	require.Equal(t, 1, counters.TerminalTransitions.AcceptedSingleBlock)
}

func TestPersonalDraftDiagnosticsConserveOneSourceAndTerminalPerCompletedDraft(t *testing.T) {
	valid := fixedWordSentence("First", 12) + "\n\n" + fixedWordSentence("Second", 12)
	singleBlock := fixedWordSentence("First", 16) + " " + fixedWordSentence("Second", 16)
	formatRepair := "**" + fixedWordSentence("First", 12) + "**\n\n**" + fixedWordSentence("Second", 12) + "**"
	fallback := strings.Join([]string{
		fixedWordSentence("First", 30),
		fixedWordSentence("Second", 30),
		fixedWordSentence("Third", 30),
		fixedWordSentence("Fourth", 30),
	}, " ")
	dialogueJSON := `{"paragraphs":["I understand what you mean, and I will answer directly without inventing anything you did not actually say.",` +
		`"We can keep this grounded and continue from the facts you established instead of turning it into another speech."]}`

	tests := []struct {
		name      string
		responses []string
		errors    []error
		sources   PersonalDraftSourceCounters
		terminals PersonalDraftTerminalCounters
	}{
		{
			name: "raw acceptance", responses: []string{valid},
			sources:   PersonalDraftSourceCounters{ShapeValid: 1},
			terminals: PersonalDraftTerminalCounters{AcceptedRaw: 1},
		},
		{
			name: "single block repair", responses: []string{singleBlock},
			sources:   PersonalDraftSourceCounters{RepairablePartition: 1},
			terminals: PersonalDraftTerminalCounters{AcceptedSingleBlock: 1},
		},
		{
			name: "format repair", responses: []string{formatRepair},
			sources:   PersonalDraftSourceCounters{ShapeValid: 1},
			terminals: PersonalDraftTerminalCounters{AcceptedRepair: 1},
		},
		{
			name: "bounded fallback", responses: []string{fallback},
			sources:   PersonalDraftSourceCounters{Over100Words: 1},
			terminals: PersonalDraftTerminalCounters{AcceptedFallback: 1},
		},
		{
			name: "strict dialogue JSON", responses: []string{dialogueJSON},
			sources:   PersonalDraftSourceCounters{ValidDialogueEnvelope: 1},
			terminals: PersonalDraftTerminalCounters{AcceptedDialogueOnly: 1},
		},
		{
			name: "hygiene retry", responses: []string{"Opening a new response. <|end|>", valid},
			sources:   PersonalDraftSourceCounters{Under24Words: 1, ShapeValid: 1},
			terminals: PersonalDraftTerminalCounters{RetryHygiene: 1, AcceptedRaw: 1},
		},
		{
			name: "empty retry", responses: []string{"", valid},
			sources:   PersonalDraftSourceCounters{Empty: 1, ShapeValid: 1},
			terminals: PersonalDraftTerminalCounters{RetryEmpty: 1, AcceptedRaw: 1},
		},
		{
			name: "contract retry", responses: []string{fixedWordSentence("Only", 40), valid},
			sources:   PersonalDraftSourceCounters{Unpartitionable24To60Words: 1, ShapeValid: 1},
			terminals: PersonalDraftTerminalCounters{RetryContract: 1, AcceptedRaw: 1},
		},
		{
			name:      "partial provider failure is not a completed draft",
			responses: []string{"partial response", valid},
			errors:    []error{openrouter.ErrTransportOrProvider, nil},
			sources:   PersonalDraftSourceCounters{ShapeValid: 1},
			terminals: PersonalDraftTerminalCounters{AcceptedRaw: 1},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ctx, diagnostics := withPersonalDraftDiagnostics(context.Background())
			calls := 0
			client := stubChatCompletionClient{generate: func(context.Context, []openrouter.Message, openrouter.StreamCallback) (string, error) {
				index := calls
				calls++
				var err error
				if index < len(test.errors) {
					err = test.errors[index]
				}
				return test.responses[index], err
			}}

			_, err := generatePersonaCompletionWithClient(
				ctx,
				client,
				&models.BotPersona{ID: 1, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue},
				[]openrouter.Message{{Role: openrouter.RoleSystem, Content: "system"}},
				nil,
			)

			require.NoError(t, err)
			counters := diagnostics.snapshot()
			require.Equal(t, test.sources, counters.RawSources)
			require.Equal(t, test.terminals, counters.TerminalTransitions)
			require.Equal(t, counters.RawSources.total(), counters.TerminalTransitions.total())
		})
	}
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
		personalDraftRejectedBoundary,
		personalDraftRejectedScene,
		personalDraftRejectedQuestion,
		personalDraftRejectedFormatting,
		personalDraftRejectedSemantics,
		personalDraftProviderTimeout,
		personalDraftProviderRateLimit,
		personalDraftProviderAccessDenied,
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
	require.Equal(t, 1, counters.RejectedBoundary)
	require.Equal(t, 1, counters.RejectedSceneConflict)
	require.Equal(t, 1, counters.ProviderAccessDenied)
	require.Equal(t, 1, counters.ProviderTransport)
}

func TestPersonalProviderFailureCountersAreTyped(t *testing.T) {
	ctx, diagnostics := withPersonalDraftDiagnostics(context.Background())
	recordPersonalProviderFailure(ctx, context.DeadlineExceeded)
	recordPersonalProviderFailure(ctx, openrouter.ErrRateLimited)
	recordPersonalProviderFailure(ctx, openrouter.ErrAccessDenied)
	recordPersonalProviderFailure(ctx, errors.New("opaque provider failure"))

	counters := diagnostics.snapshot()
	require.Equal(t, 1, counters.ProviderTimeout)
	require.Equal(t, 1, counters.ProviderRateLimit)
	require.Equal(t, 1, counters.ProviderAccessDenied)
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

func TestPersonalDraftDiagnosticsCountServerConstraintRejections(t *testing.T) {
	ctx, diagnostics := withPersonalDraftDiagnostics(context.Background())
	boundaryResponse := "Fine, I am coming home with you even though I am not comfortable.\n\nI will leave with you now, and we can discuss my concern after arriving."
	recordPersonalDraftRejectionsWithConstraints(ctx, boundaryResponse, personalResponseConstraints{RequireBoundary: true})
	sceneResponse := "My leg is the one in play now, so I will decide what happens.\n\nWe can slow down and make sure we are following the same rules."
	recordPersonalDraftRejectionsWithConstraints(ctx, sceneResponse, personalResponseConstraints{Ownership: []personalOwnershipConstraint{{Subject: "leg", ForbiddenPossessive: "my"}}})

	counters := diagnostics.snapshot()
	require.Equal(t, 1, counters.RejectedBoundary)
	require.Equal(t, 1, counters.RejectedSceneConflict)
}

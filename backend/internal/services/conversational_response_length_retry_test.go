package services

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

func fixedWordSentence(lead string, words int) string {
	values := []string{lead}
	for len(values) < words {
		values = append(values, "word")
	}
	return strings.Join(values, " ") + "."
}

func TestClassifyPersonalDraftSourceUsesOnePrivacySafeBucket(t *testing.T) {
	partitionable61 := strings.Join([]string{
		fixedWordSentence("First", 20),
		fixedWordSentence("Second", 20),
		fixedWordSentence("Third", 21),
	}, " ")

	tests := []struct {
		name     string
		response string
		expected personalDraftSource
	}{
		{name: "empty", response: "", expected: personalDraftSourceEmpty},
		{
			name:     "valid shape",
			response: fixedWordSentence("First", 12) + "\n\n" + fixedWordSentence("Second", 12),
			expected: personalDraftSourceShapeValid,
		},
		{
			name: "valid dialogue envelope",
			response: `{"paragraphs":["I understand what you mean, and I will answer directly without inventing anything you did not actually say.",` +
				`"We can keep this grounded and continue from the facts you established instead of turning it into another speech."]}`,
			expected: personalDraftSourceValidDialogueEnvelope,
		},
		{name: "under 24", response: fixedWordSentence("Short", 23), expected: personalDraftSourceUnder24},
		{
			name:     "repairable partition",
			response: fixedWordSentence("First", 12) + " " + fixedWordSentence("Second", 12),
			expected: personalDraftSourceRepairablePartition,
		},
		{
			name:     "24 to 60 without safe partition",
			response: fixedWordSentence("Only", 40),
			expected: personalDraftSourceUnpartitionable24To60,
		},
		{
			name:     "61 to 100 repairable as three medium blocks",
			response: partitionable61,
			expected: personalDraftSourceRepairablePartition,
		},
		{
			name:     "61 to 100 without safe partition",
			response: fixedWordSentence("Only", 61),
			expected: personalDraftSourceUnpartitionable61To100,
		},
		{name: "over 100", response: fixedWordSentence("Long", 101), expected: personalDraftSourceOver100},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			require.Equal(t, test.expected, classifyPersonalDraftSource(test.response))
		})
	}
}

func TestRepairPersonalConversationDraftAcceptsSixtyOneWordsAsThreeMediumBlocks(t *testing.T) {
	draft := strings.Join([]string{
		fixedWordSentence("First", 20),
		fixedWordSentence("Second", 20),
		fixedWordSentence("Third", 21),
	}, " ")

	repaired := repairPersonalConversationDraft(draft)
	valid, detail := validatePersonalConversationResponse(repaired)

	require.True(t, valid, detail)
	require.Len(t, blankLinePattern.Split(repaired, -1), 3)
	require.Equal(t, strings.Join(strings.Fields(draft), " "), strings.Join(strings.Fields(repaired), " "))
}

func TestRepairPersonalConversationDraftPreservesThreeMediumBlocksAndShortFinal(t *testing.T) {
	draft := strings.Join([]string{
		fixedWordSentence("First", 12),
		fixedWordSentence("Second", 12),
		fixedWordSentence("Third", 12),
		fixedWordSentence("Finally", 5),
	}, "\n\n")

	repaired := repairPersonalConversationDraft(draft)
	valid, detail := validatePersonalConversationResponse(repaired)

	require.True(t, valid, detail)
	require.Equal(t, draft, repaired)
	require.Len(t, blankLinePattern.Split(repaired, -1), 4)
}

func TestLengthOnlyFailureUsesEarlyStrictDialogueJSONRetry(t *testing.T) {
	ctx, diagnostics := withPersonalDraftDiagnostics(context.Background())
	calls := 0
	client := &optionsAwareSequenceChatCompletionClient{generate: func(attemptCtx context.Context, messages []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		calls++
		if calls == 1 {
			return "Too short.", nil
		}
		require.Contains(t, messages[0].Content, "[Personal Length-Only Recovery]")
		require.NotContains(t, messages[0].Content, "[Personal Response Shape Retry]")
		deadline, ok := attemptCtx.Deadline()
		require.True(t, ok)
		require.LessOrEqual(t, time.Until(deadline), personalGenerationAttemptTimeouts[1])
		return `{"paragraphs":["I understand what you mean, and I will answer directly without inventing anything you did not actually say.","We can keep this grounded and continue from the facts you established instead of turning it into another speech."]}`, nil
	}}

	response, err := generatePersonaCompletionWithClient(
		ctx,
		client,
		&models.BotPersona{ID: 1, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue},
		[]openrouter.Message{{Role: openrouter.RoleSystem, Content: "system"}},
		nil,
	)

	require.NoError(t, err)
	require.Equal(t, 2, calls)
	valid, detail := validatePersonalConversationResponse(response)
	require.True(t, valid, detail)
	require.NotContains(t, response, `"paragraphs"`)

	counters := diagnostics.snapshot()
	require.Equal(t, 1, counters.RawSources.Under24Words)
	require.Equal(t, 1, counters.RawSources.ValidDialogueEnvelope)
	require.Equal(t, 1, counters.TerminalTransitions.RetryContract)
	require.Equal(t, 1, counters.TerminalTransitions.AcceptedDialogueOnly)
	require.Equal(t, 2, counters.RawSources.total())
	require.Equal(t, 2, counters.TerminalTransitions.total())
}

type responseFormatRecordingClient struct {
	calls   int
	options []openrouter.GenerationOptions
}

func (c *responseFormatRecordingClient) Generate(context.Context, []openrouter.Message, openrouter.StreamCallback) (string, error) {
	return "", fmt.Errorf("unbounded generation should not be used")
}

func (c *responseFormatRecordingClient) GenerateWithOptions(_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback, options openrouter.GenerationOptions) (string, error) {
	c.calls++
	c.options = append(c.options, options)
	if c.calls == 1 {
		return "Too short.", nil
	}
	if len(messages) == 0 || !strings.Contains(messages[0].Content, "[Personal Length-Only Recovery]") {
		return "", fmt.Errorf("length recovery prompt was not selected")
	}
	return `{"paragraphs":["I understand what you mean, and I will answer directly without inventing anything you did not actually say.","We can keep this grounded and continue from the facts you established instead of turning it into another speech."]}`, nil
}

func TestStrictRecoveryRequestsProviderJSONMode(t *testing.T) {
	client := &responseFormatRecordingClient{}
	response, err := generatePersonaCompletionWithClient(
		context.Background(),
		client,
		&models.BotPersona{ID: 1, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue},
		[]openrouter.Message{{Role: openrouter.RoleSystem, Content: "system"}},
		nil,
	)

	require.NoError(t, err)
	require.NotEmpty(t, response)
	require.Len(t, client.options, 2)
	require.Equal(t, "", client.options[0].ResponseFormat)
	require.Equal(t, "json_object", client.options[1].ResponseFormat)
}

func TestLengthRetryIsNotUsedWhenDraftHasAnyOtherContractFailure(t *testing.T) {
	tests := []struct {
		name  string
		draft string
	}{
		{name: "narration", draft: "My breath hitches. This reply remains much too short."},
		{name: "ownership", draft: "Your turn, use my leg. My turn now, so I will use your leg."},
		{name: "question budget", draft: "Are you sure? Do you want to continue?"},
		{name: "formatting", draft: `"This quoted reply is much too short to satisfy the contract."`},
		{name: "other semantics", draft: "You absolute . This reply is still much too short to satisfy the contract."},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			calls := 0
			client := stubChatCompletionClient{generate: func(_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
				calls++
				if calls == 1 {
					return test.draft, nil
				}
				require.Contains(t, messages[0].Content, "[Personal Response Shape Retry]")
				require.NotContains(t, messages[0].Content, "[Personal Length-Only Recovery]")
				return fixedWordSentence("First", 12) + "\n\n" + fixedWordSentence("Second", 12), nil
			}}

			_, err := generatePersonaCompletionWithClient(
				context.Background(),
				client,
				&models.BotPersona{ID: 1, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue},
				[]openrouter.Message{{Role: openrouter.RoleSystem, Content: "system"}},
				nil,
			)

			require.NoError(t, err)
			require.Equal(t, 2, calls)
		})
	}
}

func TestLengthOnlyRetryCoversEveryPureLengthBucket(t *testing.T) {
	tests := []struct {
		name  string
		draft string
	}{
		{name: "under 24", draft: fixedWordSentence("Short", 23)},
		{name: "unpartitionable 24 to 60", draft: fixedWordSentence("Only", 40)},
		{name: "unpartitionable 61 to 100", draft: fixedWordSentence("Only", 61)},
		{name: "over 100", draft: fixedWordSentence("Only", 101)},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			require.True(t, isLengthOnlyPersonalDraft(test.draft))
		})
	}
}

func TestStrictPersonalDialogueJSONFailsClosed(t *testing.T) {
	validFirst := "I understand what you mean, and I will answer directly without inventing anything you did not actually say."
	validSecond := "We can keep this grounded and continue from the facts you established instead of turning it into another speech."
	tests := []struct {
		name string
		raw  string
	}{
		{name: "not json", raw: validFirst + "\n\n" + validSecond},
		{name: "unknown field", raw: fmt.Sprintf(`{"paragraphs":[%q,%q],"extra":true}`, validFirst, validSecond)},
		{name: "trailing object", raw: fmt.Sprintf(`{"paragraphs":[%q,%q]} {}`, validFirst, validSecond)},
		{name: "wrong paragraph count", raw: fmt.Sprintf(`{"paragraphs":[%q]}`, validFirst)},
		{name: "quoted dialogue", raw: fmt.Sprintf(`{"paragraphs":[%q,%q]}`, `"`+validFirst+`"`, validSecond)},
		{name: "narration", raw: fmt.Sprintf(`{"paragraphs":[%q,%q]}`, "*I nod slowly.* "+validFirst, validSecond)},
		{name: "control token", raw: fmt.Sprintf(`{"paragraphs":[%q,%q]}`, validFirst+" <|end|>", validSecond)},
		{
			name: "ownership reversal",
			raw:  `{"paragraphs":["Your turn now, so use my leg and show me how steady you can remain.","Actually, your leg is the target because this is my turn, so hold completely still."]}`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recovered, err := parseAndValidatePersonalDialogueOnlyJSON(test.raw)
			require.Error(t, err)
			require.Empty(t, recovered)
		})
	}
}

func TestMalformedEarlyLengthRecoveryReturnsToGenericRetryPath(t *testing.T) {
	calls := 0
	client := &optionsAwareSequenceChatCompletionClient{generate: func(_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		calls++
		switch calls {
		case 1:
			return "Too short.", nil
		case 2:
			require.Contains(t, messages[0].Content, "[Personal Length-Only Recovery]")
			return `{"paragraphs":["still too short","also too short"],"extra":true}`, nil
		default:
			require.Contains(t, messages[0].Content, "[Personal Response Shape Retry]")
			return fixedWordSentence("First", 12) + "\n\n" + fixedWordSentence("Second", 12), nil
		}
	}}

	response, err := generatePersonaCompletionWithClient(
		context.Background(),
		client,
		&models.BotPersona{ID: 1, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue},
		[]openrouter.Message{{Role: openrouter.RoleSystem, Content: "system"}},
		nil,
	)

	require.NoError(t, err)
	require.Equal(t, 3, calls)
	valid, detail := validatePersonalConversationResponse(response)
	require.True(t, valid, detail)
}

func TestCancellationDuringEarlyLengthRecoveryStopsFurtherCalls(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	client := stubChatCompletionClient{generate: func(attemptCtx context.Context, _ []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		calls++
		if calls == 1 {
			cancel()
			return "Too short.", nil
		}
		return "", attemptCtx.Err()
	}}

	_, err := generatePersonaCompletionWithClient(
		ctx,
		client,
		&models.BotPersona{ID: 1, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue},
		[]openrouter.Message{{Role: openrouter.RoleSystem, Content: "system"}},
		nil,
	)

	require.ErrorIs(t, err, context.Canceled)
	require.Equal(t, 1, calls)
}

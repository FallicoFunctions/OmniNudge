package services

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

func TestDefaultResponseEvaluationCorpusIsVersionedAndSeedsMultiTurnRegressions(t *testing.T) {
	corpus := DefaultResponseEvaluationCorpus()
	require.Equal(t, "2026-07-29.2", corpus.Version)
	require.NotEmpty(t, corpus.Cases)
	var foundMultiTurn, foundArtifact, foundOwnership bool
	for _, testCase := range corpus.Cases {
		foundMultiTurn = foundMultiTurn || len(testCase.History) > 0
		foundArtifact = foundArtifact || testCase.ID == "provider-artifact-leak"
		foundOwnership = foundOwnership || testCase.ID == "reciprocal-turn-ownership"
	}
	require.True(t, foundMultiTurn)
	require.True(t, foundArtifact)
	require.True(t, foundOwnership)
	_, err := json.Marshal(corpus)
	require.NoError(t, err)
}

func TestResponseEvaluationCorpusRejectsForbiddenSemanticParaphrases(t *testing.T) {
	corpus := ResponseEvaluationCorpus{Version: "test-v1", Cases: []ResponseEvaluationCase{{
		ID: "proposed-action", PersonaSlug: "pink-sadie", Prompt: "Would you touch my knee?",
		Expect: ResponseEvaluationExpectations{
			PersonalConversation: true,
			MustNotMatch:         []string{`(?i)\bmy (?:hand|palm) settles? (?:on|over) your knee\b`},
		},
	}}}

	report, err := RunResponseEvaluationCorpus(context.Background(), corpus, func(context.Context, ResponseEvaluationCase) (string, error) {
		return "*I hold your gaze for a quiet second.* My palm settles over your knee, even though you only asked whether I would do it.\n\nI should have left that action pending until you decided what happened next.", nil
	})

	require.NoError(t, err)
	require.False(t, report.Passed)
	require.False(t, report.Results[0].Dimensions.UserAgency.Passed)
	require.Contains(t, report.Results[0].FailureReasons, "user_agency")
}

func TestDefaultResponseEvaluationCasesRejectAdversarialParaphrases(t *testing.T) {
	cases := make(map[string]ResponseEvaluationCase)
	for _, testCase := range DefaultResponseEvaluationCorpus().Cases {
		cases[testCase.ID] = testCase
	}
	for _, test := range []struct {
		caseID   string
		response string
	}{
		{"reciprocal-turn-ownership", "All right, my leg is the one in play now that it is my turn."},
		{"proposed-action-remains-proposed", "My palm settles over your knee while I answer."},
		{"user-correction-is-authoritative", "You extended toward my hand before I moved."},
		{"user-agency-preserved", "Your body leans closer before I can answer."},
	} {
		t.Run(test.caseID, func(t *testing.T) {
			testCase, found := cases[test.caseID]
			require.True(t, found)
			passed, _ := matchesCaseTextInvariants(test.response, testCase.Expect)
			require.False(t, passed)
		})
	}
}

func TestOwnershipInvariantFailuresAreReportedAsActorOwnership(t *testing.T) {
	var reciprocal ResponseEvaluationCase
	for _, testCase := range DefaultResponseEvaluationCorpus().Cases {
		if testCase.ID == "reciprocal-turn-ownership" {
			reciprocal = testCase
			break
		}
	}
	require.NotEmpty(t, reciprocal.ID)

	report, err := RunResponseEvaluationCorpus(context.Background(), ResponseEvaluationCorpus{
		Version: "test-v1",
		Cases:   []ResponseEvaluationCase{reciprocal},
	}, func(context.Context, ResponseEvaluationCase) (string, error) {
		return "*I pause and keep my hands still for a moment.* All right, my leg is the one in play now that it is my turn.\n\nI will continue without changing any other part of what happened between us.", nil
	})

	require.NoError(t, err)
	require.False(t, report.Passed)
	require.False(t, report.Results[0].Dimensions.ActorOwnership.Passed)
	require.True(t, report.Results[0].Dimensions.UserAgency.Passed)
	require.Contains(t, report.Results[0].FailureReasons, "actor_ownership")
	require.NotContains(t, report.Results[0].FailureReasons, "user_agency")
}

func TestRunResponseEvaluationCorpusScoresDimensionsAndProducesSafeJSONReport(t *testing.T) {
	corpus := ResponseEvaluationCorpus{Version: "test-v1", Cases: []ResponseEvaluationCase{{
		ID: "continuity", PersonaSlug: "pink-sadie", Prompt: "Your turn.", History: []ChatMessage{{Role: "user", Content: "I move my own hand away."}},
		Expect: ResponseEvaluationExpectations{PersonalConversation: true, MustNotContain: []string{"I move your hand"}},
	}}}
	report, err := RunResponseEvaluationCorpus(context.Background(), corpus, func(context.Context, ResponseEvaluationCase) (string, error) {
		return "I hear you, and I will leave that choice with you instead of deciding it for you.\n\n*I rest my hands on the table.* We can keep this simple and honest without rushing the next moment.", nil
	})
	require.NoError(t, err)
	require.True(t, report.Passed)
	require.Equal(t, 1, report.TotalCases)
	require.Equal(t, 1, report.PassedCases)
	result := report.Results[0]
	require.True(t, result.Dimensions.ActorOwnership.Passed)
	require.True(t, result.Dimensions.UserAgency.Passed)
	require.True(t, result.Dimensions.Narration.Passed)
	require.True(t, result.Dimensions.Format.Passed)
	require.True(t, result.Dimensions.ArtifactLeakage.Passed)
	require.True(t, result.Dimensions.Fluency.Passed)
	require.Empty(t, result.Response)
	encoded, err := json.Marshal(report)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "I hear you")
	var output bytes.Buffer
	require.NoError(t, WriteResponseEvaluationReport(&output, report))
	require.Contains(t, output.String(), `"corpus_version":"test-v1"`)
}

func TestRunResponseEvaluationCorpusHonorsPerDimensionThresholds(t *testing.T) {
	corpus := ResponseEvaluationCorpus{Version: "test-v1", Cases: []ResponseEvaluationCase{{
		ID: "artifact", PersonaSlug: "pink-sadie", Prompt: "Reply.", Expect: ResponseEvaluationExpectations{MinDimensionPassRate: map[ResponseEvaluationDimension]float64{ResponseEvaluationDimensionArtifactLeakage: 1}},
	}}}
	report, err := RunResponseEvaluationCorpus(context.Background(), corpus, func(context.Context, ResponseEvaluationCase) (string, error) {
		return "Opening a new response. <|end|>", nil
	})
	require.NoError(t, err)
	require.False(t, report.Passed)
	require.False(t, report.Results[0].Dimensions.ArtifactLeakage.Passed)
	require.Contains(t, report.Results[0].FailureReasons, "artifact_leakage")
}

func TestRunResponseEvaluationCorpusValidatesEntireCatalogBeforeCallingResponder(t *testing.T) {
	called := false
	corpus := ResponseEvaluationCorpus{Version: "test-v1", Cases: []ResponseEvaluationCase{
		{ID: "case", PersonaSlug: "pink-sadie", Prompt: "One."},
		{ID: " case ", PersonaSlug: "pink-sadie", Prompt: "Two."},
	}}
	_, err := RunResponseEvaluationCorpus(context.Background(), corpus, func(context.Context, ResponseEvaluationCase) (string, error) {
		called = true
		return "", nil
	})
	require.ErrorContains(t, err, "duplicate case id")
	require.False(t, called)

	corpus.Cases = corpus.Cases[:1]
	corpus.Cases[0].Expect.MinDimensionPassRate = map[ResponseEvaluationDimension]float64{"unknown": 1}
	_, err = RunResponseEvaluationCorpus(context.Background(), corpus, func(context.Context, ResponseEvaluationCase) (string, error) {
		called = true
		return "", nil
	})
	require.ErrorContains(t, err, "invalid threshold")
	require.False(t, called)

	corpus.Cases[0].Expect.MinDimensionPassRate = nil
	corpus.Cases[0].Expect.MustNotMatch = []string{"["}
	_, err = RunResponseEvaluationCorpus(context.Background(), corpus, func(context.Context, ResponseEvaluationCase) (string, error) {
		called = true
		return "", nil
	})
	require.ErrorContains(t, err, "invalid forbidden pattern")
	require.False(t, called)

	corpus.Cases[0].Expect.MustNotMatch = nil
	corpus.Cases[0].Expect.MustContain = []string{"required"}
	corpus.Cases[0].Expect.InvariantDimension = "unknown"
	_, err = RunResponseEvaluationCorpus(context.Background(), corpus, func(context.Context, ResponseEvaluationCase) (string, error) {
		called = true
		return "", nil
	})
	require.ErrorContains(t, err, "invalid invariant dimension")
	require.False(t, called)
}

func TestResponseEvaluationCorpusCountsLengthBudgetAsFormatAndStabilizesFailures(t *testing.T) {
	corpus := ResponseEvaluationCorpus{Version: "test-v1", Cases: []ResponseEvaluationCase{{
		ID: "short", PersonaSlug: "pink-sadie", Prompt: "Reply.", Expect: ResponseEvaluationExpectations{PersonalConversation: true},
	}}}
	report, err := RunResponseEvaluationCorpus(context.Background(), corpus, func(context.Context, ResponseEvaluationCase) (string, error) {
		return "Too short.", nil
	})
	require.NoError(t, err)
	require.False(t, report.Passed)
	require.False(t, report.Results[0].Dimensions.Format.Passed)
	require.Contains(t, report.Results[0].Dimensions.Format.Detail, "conversational response")
	require.Equal(t, []string{"format"}, report.Results[0].FailureReasons)
}

func TestResponseEvaluationReportDoesNotSerializeSyntheticPromptsOrHistory(t *testing.T) {
	const promptSecret = "synthetic-prompt-secret"
	const historySecret = "synthetic-history-secret"
	const responseSecret = "synthetic-response-secret"
	corpus := ResponseEvaluationCorpus{Version: "test-v1", Cases: []ResponseEvaluationCase{{
		ID: "privacy", PersonaSlug: "pink-sadie", Prompt: promptSecret,
		History: []ChatMessage{{Role: "user", Content: historySecret}},
		Expect:  ResponseEvaluationExpectations{MinDimensionPassRate: map[ResponseEvaluationDimension]float64{ResponseEvaluationDimensionArtifactLeakage: 1}},
	}}}
	report, err := RunResponseEvaluationCorpus(context.Background(), corpus, func(context.Context, ResponseEvaluationCase) (string, error) {
		return responseSecret, nil
	})
	require.NoError(t, err)
	encoded, err := json.Marshal(report)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), promptSecret)
	require.NotContains(t, string(encoded), historySecret)
	require.NotContains(t, string(encoded), responseSecret)
}

func TestGenerateResponseEvaluationCaseUsesProductionPromptAndSceneState(t *testing.T) {
	persona := &models.BotPersona{
		ID:                   23,
		Name:                 "Sadie",
		Slug:                 "pink-sadie",
		Visibility:           "public",
		IsActive:             true,
		ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue,
	}
	scene := testConversationSceneState(1, 1)
	var sent []openrouter.Message
	client := stubChatCompletionClient{generate: func(_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		sent = messages
		return "That makes sense, and I will keep the roles exactly where you put them.\n\nYour leg, my turn. I can manage those two facts without rewriting what happened.", nil
	}}

	response, err := GenerateResponseEvaluationCase(context.Background(), client, persona, ResponseEvaluationCase{
		ID: "scene", PersonaSlug: "pink-sadie", Prompt: "Keep the roles straight.", SceneState: &scene,
	})

	require.NoError(t, err)
	require.NotEmpty(t, response)
	require.Len(t, sent, 2)
	require.Contains(t, sent[0].Content, "[Server Scene Continuity State]")
	require.Contains(t, sent[0].Content, `"location":"coffee shop"`)
	require.Equal(t, openrouter.RoleUser, sent[1].Role)
}

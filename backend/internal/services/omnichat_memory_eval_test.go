package services

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

// The eval harness has to be trustworthy before its verdict on a real model
// means anything, so these tests drive it with a scripted extractor. A failure
// reported against OpenRouter should implicate the model, never the evaluator.

type scriptedExtractor struct {
	episodes []models.OmniChatMemoryEpisode
	err      error
}

func (s *scriptedExtractor) Extract(context.Context, *models.BotPersona, []*models.BotMessage, []string) ([]models.OmniChatMemoryEpisode, error) {
	return s.episodes, s.err
}

func evalCase() OmniChatMemoryEvalCase {
	return OmniChatMemoryEvalCase{
		Name:               "sample",
		Transcript:         []OmniChatMemoryEvalTurn{{Role: "user", Content: "something happened"}},
		MinEpisodes:        1,
		MaxEpisodes:        4,
		MinDistinctiveness: 0.7,
		MinSalience:        0.6,
		RequiredEntities:   []string{"mcdonald"},
	}
}

func goodEpisode() models.OmniChatMemoryEpisode {
	return models.OmniChatMemoryEpisode{
		Title: "Mike wrecked the bathroom", Summary: "At 5am.",
		Salience: 0.9, Distinctiveness: 0.95,
		Entities: []models.OmniChatMemoryEntityRef{
			{CanonicalName: "McDonald's", Kind: models.OmniChatMemoryEntityPlace},
		},
	}
}

func TestRunOmniChatMemoryEvalPassesOnGoodExtraction(t *testing.T) {
	result := RunOmniChatMemoryEval(context.Background(),
		&scriptedExtractor{episodes: []models.OmniChatMemoryEpisode{goodEpisode()}},
		nil, evalCase())

	require.True(t, result.Passed(), "failures: %v", result.Failures)
	require.InDelta(t, 0.95, result.TopDistinctiveness, 0.001)
	require.InDelta(t, 0.9, result.TopSalience, 0.001)
}

func TestRunOmniChatMemoryEvalCatchesUncalibratedScores(t *testing.T) {
	// The exact failure this harness exists to catch: a model that returns a
	// comfortable middling score instead of committing to a judgement.
	flat := goodEpisode()
	flat.Distinctiveness = 0.5
	flat.Salience = 0.5

	result := RunOmniChatMemoryEval(context.Background(),
		&scriptedExtractor{episodes: []models.OmniChatMemoryEpisode{flat}}, nil, evalCase())

	require.False(t, result.Passed())
	require.Len(t, result.Failures, 2)
	require.Contains(t, result.Failures[0], "distinctiveness 0.50 below required 0.70")
	require.Contains(t, result.Failures[1], "salience 0.50 below required 0.60")
}

func TestRunOmniChatMemoryEvalCatchesFabrication(t *testing.T) {
	// A transcript where nothing happened must produce nothing. Recording one
	// anyway would fill a user's history with events they never had.
	noneExpected := OmniChatMemoryEvalCase{
		Name:        "nothing-happened",
		Transcript:  []OmniChatMemoryEvalTurn{{Role: "user", Content: "what should I do this weekend?"}},
		MinEpisodes: 0,
		MaxEpisodes: 0,
	}
	result := RunOmniChatMemoryEval(context.Background(),
		&scriptedExtractor{episodes: []models.OmniChatMemoryEpisode{goodEpisode()}}, nil, noneExpected)

	require.False(t, result.Passed())
	require.Contains(t, result.Failures[0], "expected at most 0 episode(s), got 1")
}

func TestRunOmniChatMemoryEvalCatchesMissingAnchor(t *testing.T) {
	// Without an anchor entity the memory exists but is unreachable from a weak
	// cue, which is the same as not remembering it.
	anchorless := goodEpisode()
	anchorless.Entities = nil

	result := RunOmniChatMemoryEval(context.Background(),
		&scriptedExtractor{episodes: []models.OmniChatMemoryEpisode{anchorless}}, nil, evalCase())

	require.False(t, result.Passed())
	require.Contains(t, result.Failures[0], `missing anchor entity "mcdonald"`)
}

func TestRunOmniChatMemoryEvalMatchesAnchorViaAlias(t *testing.T) {
	viaAlias := goodEpisode()
	viaAlias.Entities = []models.OmniChatMemoryEntityRef{
		{CanonicalName: "The golden arches", Kind: models.OmniChatMemoryEntityPlace,
			Aliases: []string{"McDonalds"}},
	}
	result := RunOmniChatMemoryEval(context.Background(),
		&scriptedExtractor{episodes: []models.OmniChatMemoryEpisode{viaAlias}}, nil, evalCase())

	require.True(t, result.Passed(), "failures: %v", result.Failures)
}

func TestRunOmniChatMemoryEvalReportsExtractionError(t *testing.T) {
	result := RunOmniChatMemoryEval(context.Background(),
		&scriptedExtractor{err: errors.New("provider refused")}, nil, evalCase())

	require.False(t, result.Passed())
	require.Error(t, result.Err)
}

// The pair comparison is the assertion fixtures cannot make: absolute scores may
// drift between models, but an extraordinary event must never score at or below
// an ordinary one in the same setting.
func TestEvaluateOmniChatMemoryPairsRequiresSeparation(t *testing.T) {
	makeResult := func(name, pairWith string, minDistinct, distinct float64) OmniChatMemoryEvalResult {
		return OmniChatMemoryEvalResult{
			Case: OmniChatMemoryEvalCase{
				Name: name, PairWith: pairWith, MinDistinctiveness: minDistinct,
			},
			Episodes:           []models.OmniChatMemoryEpisode{{Distinctiveness: distinct}},
			TopDistinctiveness: distinct,
		}
	}

	tests := []struct {
		name           string
		memorableScore float64
		routineScore   float64
		wantPassed     bool
	}{
		{name: "clear separation", memorableScore: 0.95, routineScore: 0.10, wantPassed: true},
		{name: "exactly at the margin", memorableScore: 0.50, routineScore: 0.30, wantPassed: true},
		{name: "too close to separate", memorableScore: 0.55, routineScore: 0.50, wantPassed: false},
		{name: "flat scores", memorableScore: 0.50, routineScore: 0.50, wantPassed: false},
		{name: "inverted", memorableScore: 0.20, routineScore: 0.80, wantPassed: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pairs := EvaluateOmniChatMemoryPairs([]OmniChatMemoryEvalResult{
				makeResult("memorable", "routine", 0.7, tt.memorableScore),
				makeResult("routine", "memorable", 0, tt.routineScore),
			})
			require.Len(t, pairs, 1, "a pair must be reported exactly once, not per member")
			require.Equal(t, "memorable", pairs[0].Memorable)
			require.Equal(t, "routine", pairs[0].Routine)
			require.Equal(t, tt.wantPassed, pairs[0].Passed)
		})
	}
}

func TestDefaultOmniChatMemoryEvalCasesAreWellFormed(t *testing.T) {
	cases := DefaultOmniChatMemoryEvalCases()
	require.NotEmpty(t, cases)

	byName := make(map[string]OmniChatMemoryEvalCase, len(cases))
	for _, evalCase := range cases {
		require.NotEmpty(t, evalCase.Transcript, "%s has no transcript", evalCase.Name)
		require.GreaterOrEqual(t, evalCase.MaxEpisodes, evalCase.MinEpisodes,
			"%s allows fewer episodes than it requires", evalCase.Name)
		_, duplicate := byName[evalCase.Name]
		require.False(t, duplicate, "duplicate case name %s", evalCase.Name)
		byName[evalCase.Name] = evalCase
	}

	// A dangling PairWith would silently drop the calibration check, which is
	// the only assertion in the suite that cannot be faked by absolute scores.
	for _, evalCase := range cases {
		if evalCase.PairWith == "" {
			continue
		}
		partner, ok := byName[evalCase.PairWith]
		require.True(t, ok, "%s pairs with unknown case %s", evalCase.Name, evalCase.PairWith)
		require.Equal(t, evalCase.Name, partner.PairWith, "pairing must be mutual")
	}
}

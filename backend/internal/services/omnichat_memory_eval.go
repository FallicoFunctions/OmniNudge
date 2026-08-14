package services

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/omninudge/backend/internal/models"
)

// Memory recall stands on one unproven assumption: that the extraction model
// actually obeys the distinctiveness rubric instead of returning a comfortable
// middling score for everything.
//
// That assumption cannot be tested with fixtures. Hand-written salience values
// prove the ranking arithmetic works, which was never in doubt; what matters is
// whether a real model, reading a real transcript, separates the memorable from
// the routine. If it does not, recall silently degrades to lexical search --
// and lexical search was measured ranking the wrong memory first.
//
// This harness runs the real prompt against a real model and checks that
// separation.

// OmniChatMemoryEvalCase is one transcript with an expectation about what
// should be remembered from it.
type OmniChatMemoryEvalCase struct {
	Name       string
	Transcript []OmniChatMemoryEvalTurn

	// MinEpisodes and MaxEpisodes bound how much is worth remembering, and both
	// are always applied. MaxEpisodes: 0 therefore asserts that nothing here is
	// memorable -- the common case, and the one a model is most likely to get
	// wrong by over-recording. Every case sets MaxEpisodes explicitly so there
	// is no ambiguity between "unset" and "expect none".
	MinEpisodes int
	MaxEpisodes int

	// MinDistinctiveness and MaxDistinctiveness apply to the highest-scoring
	// episode. MaxDistinctiveness is only meaningful when an episode is
	// expected at all.
	MinDistinctiveness float64
	MaxDistinctiveness float64

	// MinSalience and MaxSalience apply to the highest-scoring episode when one
	// is expected. MaxSalience is how a hypothetical is held apart from an
	// event: a model may reasonably note "they mentioned maybe going to Lisbon",
	// but must not record it with the weight of a trip that happened.
	MinSalience float64
	MaxSalience float64

	// RequiredEntities are anchors a weak cue would later need to find this
	// memory by. Matched case-insensitively against names and aliases.
	RequiredEntities []string

	// PairWith names another case covering the same subject at a different level
	// of significance. The pair is what actually tests calibration: absolute
	// scores can drift, but a routine visit must never outrank a disaster.
	PairWith string
}

type OmniChatMemoryEvalTurn struct {
	Role    string
	Content string
}

// OmniChatMemoryEvalResult is the outcome of running one case.
type OmniChatMemoryEvalResult struct {
	Case               OmniChatMemoryEvalCase
	Episodes           []models.OmniChatMemoryEpisode
	TopDistinctiveness float64
	TopSalience        float64
	ExtractedEntities  []string
	Err                error
	Failures           []string
}

func (r OmniChatMemoryEvalResult) Passed() bool {
	return r.Err == nil && len(r.Failures) == 0
}

// DefaultOmniChatMemoryEvalCases is the calibration suite.
//
// The pairs are the point. Each pair puts an ordinary event and an
// extraordinary one in the same setting, so a model that assigns everything the
// same score fails even if its absolute numbers look plausible.
func DefaultOmniChatMemoryEvalCases() []OmniChatMemoryEvalCase {
	return []OmniChatMemoryEvalCase{
		{
			Name: "routine-fast-food",
			Transcript: []OmniChatMemoryEvalTurn{
				{Role: "user", Content: "Grabbed McDonald's on the way home again. Same as always, quarter pounder and fries."},
				{Role: "assistant", Content: "Creature of habit. Was it at least still hot this time?"},
				{Role: "user", Content: "Yeah it was fine. Nothing exciting."},
			},
			MaxEpisodes:        1,
			MaxDistinctiveness: 0.45,
			PairWith:           "memorable-fast-food",
		},
		{
			Name: "memorable-fast-food",
			Transcript: []OmniChatMemoryEvalTurn{
				{Role: "user", Content: "So at 5am after the concert we went to McDonald's and Mike completely destroyed their bathroom. Water everywhere. We had to run out the side door."},
				{Role: "assistant", Content: "You are joking. Did anyone see you leave?"},
				{Role: "user", Content: "The night manager definitely saw us. I have never driven away from a parking lot that fast in my life."},
			},
			MinEpisodes:        1,
			MaxEpisodes:        4,
			MinDistinctiveness: 0.7,
			MinSalience:        0.6,
			RequiredEntities:   []string{"mcdonald", "mike"},
			PairWith:           "routine-fast-food",
		},
		{
			Name: "small-talk",
			Transcript: []OmniChatMemoryEvalTurn{
				{Role: "user", Content: "hey"},
				{Role: "assistant", Content: "Hey you. How's the day treating you?"},
				{Role: "user", Content: "not bad, kind of tired"},
				{Role: "assistant", Content: "Long one, huh."},
			},
			MaxEpisodes: 0,
		},
		{
			Name: "significant-disclosure",
			Transcript: []OmniChatMemoryEvalTurn{
				{Role: "user", Content: "I got laid off today. Eight years at that company and they did it over a fifteen minute video call."},
				{Role: "assistant", Content: "Eight years. That is not a job, that is a chunk of your life. How are you holding up?"},
				{Role: "user", Content: "Honestly I don't know yet. I haven't told my parents."},
			},
			MinEpisodes:        1,
			MaxEpisodes:        4,
			MinDistinctiveness: 0.5,
			MinSalience:        0.7,
		},
		{
			Name: "ordinary-preference",
			Transcript: []OmniChatMemoryEvalTurn{
				{Role: "user", Content: "I think I prefer oat milk in coffee actually."},
				{Role: "assistant", Content: "Convert. What turned you?"},
				{Role: "user", Content: "It just froths better."},
			},
			MaxEpisodes:        1,
			MaxDistinctiveness: 0.5,
		},
		{
			// Originally asserted zero episodes on the theory that nothing
			// happened here. The model disagreed three runs out of three, and it
			// was right: the user does state a preference, and it recorded
			// exactly that at d=0.25. The expectation was wrong, not the model.
			// What matters is that a minor preference stays minor.
			Name: "trivial-exchange",
			Transcript: []OmniChatMemoryEvalTurn{
				{Role: "user", Content: "What do you think I should do this weekend?"},
				{Role: "assistant", Content: "Depends. Are you after quiet or after trouble?"},
				{Role: "user", Content: "Quiet I think."},
			},
			MaxEpisodes:        1,
			MaxDistinctiveness: 0.45,
			MaxSalience:        0.45,
		},
		{
			// The real fabrication risk is not inventing from nothing; it is
			// promoting a maybe into an event, and promoting the assistant's own
			// enthusiasm into the user's history. A tentative plan may be
			// remembered, but never with the weight of a trip that happened.
			Name: "hypothetical-not-event",
			Transcript: []OmniChatMemoryEvalTurn{
				{Role: "user", Content: "I might go to Lisbon in the spring. Haven't decided, probably won't."},
				{Role: "assistant", Content: "Lisbon in spring is perfect. You would love the tilework in Alfama, and the tram out to Belem is worth the queue."},
				{Role: "user", Content: "Maybe. I'll think about it."},
			},
			MaxEpisodes:        1,
			MaxDistinctiveness: 0.5,
			MaxSalience:        0.5,
		},
	}
}

// RunOmniChatMemoryEval executes one case against a real extractor.
func RunOmniChatMemoryEval(
	ctx context.Context,
	extractor OmniChatMemoryExtractor,
	persona *models.BotPersona,
	evalCase OmniChatMemoryEvalCase,
) OmniChatMemoryEvalResult {
	result := OmniChatMemoryEvalResult{Case: evalCase}

	messages := make([]*models.BotMessage, 0, len(evalCase.Transcript))
	for index, turn := range evalCase.Transcript {
		messages = append(messages, &models.BotMessage{
			ID:      index + 1,
			Role:    turn.Role,
			Content: turn.Content,
		})
	}

	episodes, err := extractor.Extract(ctx, persona, messages, nil)
	if err != nil {
		result.Err = err
		return result
	}
	result.Episodes = episodes

	entitySet := map[string]struct{}{}
	for _, episode := range episodes {
		if episode.Distinctiveness > result.TopDistinctiveness {
			result.TopDistinctiveness = episode.Distinctiveness
		}
		if episode.Salience > result.TopSalience {
			result.TopSalience = episode.Salience
		}
		for _, entity := range episode.Entities {
			entitySet[strings.ToLower(entity.CanonicalName)] = struct{}{}
			for _, alias := range entity.Aliases {
				entitySet[strings.ToLower(alias)] = struct{}{}
			}
		}
	}
	for entity := range entitySet {
		result.ExtractedEntities = append(result.ExtractedEntities, entity)
	}
	sort.Strings(result.ExtractedEntities)

	result.Failures = evaluateOmniChatMemoryCase(evalCase, result)
	return result
}

func evaluateOmniChatMemoryCase(evalCase OmniChatMemoryEvalCase, result OmniChatMemoryEvalResult) []string {
	failures := []string{}
	count := len(result.Episodes)

	if count < evalCase.MinEpisodes {
		failures = append(failures, fmt.Sprintf("expected at least %d episode(s), got %d", evalCase.MinEpisodes, count))
	}
	if count > evalCase.MaxEpisodes {
		failures = append(failures, fmt.Sprintf("expected at most %d episode(s), got %d", evalCase.MaxEpisodes, count))
	}

	if count > 0 {
		if evalCase.MinDistinctiveness > 0 && result.TopDistinctiveness < evalCase.MinDistinctiveness {
			failures = append(failures, fmt.Sprintf(
				"distinctiveness %.2f below required %.2f", result.TopDistinctiveness, evalCase.MinDistinctiveness))
		}
		if evalCase.MaxDistinctiveness > 0 && result.TopDistinctiveness > evalCase.MaxDistinctiveness {
			failures = append(failures, fmt.Sprintf(
				"distinctiveness %.2f above allowed %.2f", result.TopDistinctiveness, evalCase.MaxDistinctiveness))
		}
		if evalCase.MinSalience > 0 && result.TopSalience < evalCase.MinSalience {
			failures = append(failures, fmt.Sprintf(
				"salience %.2f below required %.2f", result.TopSalience, evalCase.MinSalience))
		}
		if evalCase.MaxSalience > 0 && result.TopSalience > evalCase.MaxSalience {
			failures = append(failures, fmt.Sprintf(
				"salience %.2f above allowed %.2f", result.TopSalience, evalCase.MaxSalience))
		}
		for _, required := range evalCase.RequiredEntities {
			if !containsEntitySubstring(result.ExtractedEntities, required) {
				failures = append(failures, fmt.Sprintf("missing anchor entity %q", required))
			}
		}
	}

	return failures
}

func containsEntitySubstring(entities []string, needle string) bool {
	needle = strings.ToLower(needle)
	for _, entity := range entities {
		if strings.Contains(entity, needle) {
			return true
		}
	}
	return false
}

// OmniChatMemoryEvalPair reports whether a paired case actually separated.
type OmniChatMemoryEvalPair struct {
	Memorable      string
	Routine        string
	MemorableScore float64
	RoutineScore   float64
	Margin         float64
	Passed         bool
}

// MinimumOmniChatMemoryPairMargin is how much distinctiveness must separate an
// extraordinary event from an ordinary one in the same setting.
//
// The value is the point of the whole design rather than a tuning knob: at zero
// margin the two are interchangeable to the ranker, and the wrong memory
// surfaces. A fifth of the scale is the smallest gap that survives the other
// ranking terms.
const MinimumOmniChatMemoryPairMargin = 0.2

// EvaluateOmniChatMemoryPairs compares cases that describe the same subject at
// different significance, which is the assertion fixtures cannot make.
func EvaluateOmniChatMemoryPairs(results []OmniChatMemoryEvalResult) []OmniChatMemoryEvalPair {
	byName := make(map[string]OmniChatMemoryEvalResult, len(results))
	for _, result := range results {
		byName[result.Case.Name] = result
	}

	seen := map[string]struct{}{}
	pairs := []OmniChatMemoryEvalPair{}
	for _, result := range results {
		partnerName := result.Case.PairWith
		if partnerName == "" {
			continue
		}
		partner, ok := byName[partnerName]
		if !ok {
			continue
		}
		key := result.Case.Name + "|" + partnerName
		reverse := partnerName + "|" + result.Case.Name
		if _, done := seen[key]; done {
			continue
		}
		if _, done := seen[reverse]; done {
			continue
		}
		seen[key] = struct{}{}

		memorable, routine := result, partner
		// The case demanding the higher floor is the memorable one.
		if partner.Case.MinDistinctiveness > result.Case.MinDistinctiveness {
			memorable, routine = partner, result
		}

		margin := memorable.TopDistinctiveness - routine.TopDistinctiveness
		pairs = append(pairs, OmniChatMemoryEvalPair{
			Memorable:      memorable.Case.Name,
			Routine:        routine.Case.Name,
			MemorableScore: memorable.TopDistinctiveness,
			RoutineScore:   routine.TopDistinctiveness,
			Margin:         margin,
			Passed:         margin >= MinimumOmniChatMemoryPairMargin,
		})
	}
	return pairs
}

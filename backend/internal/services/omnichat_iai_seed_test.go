package services

import (
	"sort"
	"testing"

	"github.com/stretchr/testify/require"
)

func sortedTemperamentKeys() []string {
	keys := IAITemperamentKeys()
	sort.Strings(keys)
	return keys
}

func TestTheAnswersOnTheFormAreTheOnesTheSpecOffers(t *testing.T) {
	// §34 lists these by name, and the interface will render whatever this
	// returns. If the two drift, somebody is offered a choice that converts to
	// nothing and gets a blanker character than they picked.
	require.Equal(t, []string{
		"blunt", "dry", "earnest", "guarded", "playful",
		"quiet", "restless", "sharp", "steady", "warm",
	}, sortedTemperamentKeys())

	// Feelings, not histories. §35: she has no past to describe, so the screen
	// asks how she is rather than what the two of them have been through.
	require.Equal(t, []string{
		"indifferent", "curious", "fond", "close", "devoted", "besotted",
	}, IAIFeelingKeys())
}

func TestPickingThreeBlendsThemRatherThanStackingThem(t *testing.T) {
	// The picks must be *averaged*. Adding would push three warm answers past
	// the top of the scale, clamp there, and make every warm character
	// identical -- which defeats the point of picking three.
	//
	// Two same-signed picks are what separates the two. An earlier version of
	// this test paired warm with guarded, whose warmth is negative, so summing
	// and averaging both pulled the number down and the test could not tell
	// them apart.
	warmAlone := SeedIAI([]string{"warm"}, "indifferent")
	warmAndEarnest := SeedIAI([]string{"warm", "earnest"}, "indifferent")

	require.Less(t, warmAndEarnest.Baseline.Warmth, warmAlone.Baseline.Warmth,
		"two warm answers must not make her warmer than the warmest of them")
	require.Greater(t, warmAndEarnest.Baseline.Trust, warmAlone.Baseline.Trust,
		"and earnest still pulls trust up, so the pick is doing something")
}

func TestAGuardedStreakPullsAWarmCharacterBack(t *testing.T) {
	warmAlone := SeedIAI([]string{"warm"}, "indifferent")
	warmAndGuarded := SeedIAI([]string{"warm", "guarded"}, "indifferent")

	require.Greater(t, warmAlone.Baseline.Warmth, warmAndGuarded.Baseline.Warmth)
	require.Greater(t, warmAndGuarded.Baseline.Firmness, warmAlone.Baseline.Firmness,
		"and makes her harder to move")
}

func TestTheSameAnswerThreeTimesIsOneAnswer(t *testing.T) {
	once := SeedIAI([]string{"warm"}, "indifferent")
	thrice := SeedIAI([]string{"warm", "warm", "warm"}, "indifferent")

	require.Equal(t, once.Baseline, thrice.Baseline,
		"saying warm three times is one answer repeated, not a character three times as warm")
}

func TestTheTablesThemselvesStayInsideWhatTheColumnsAccept(t *testing.T) {
	// Checking SeedIAI's *output* would prove nothing: clampSeed forces the
	// range, so a row typed as 5.0 would still come back as 1.0 and pass. The
	// rows are the part a person edits, so the rows are what to check.
	for _, temperament := range iaiTemperaments {
		for _, value := range []float64{
			temperament.Mood, temperament.Trust, temperament.Warmth, temperament.Firmness,
		} {
			require.GreaterOrEqual(t, value, -1.0, temperament.Key)
			require.LessOrEqual(t, value, 1.0, temperament.Key)
		}
	}
	for _, feeling := range iaiFeelings {
		require.GreaterOrEqual(t, feeling.Warmth, -1.0, feeling.Key)
		require.LessOrEqual(t, feeling.Warmth, 1.0, feeling.Key)
		require.GreaterOrEqual(t, feeling.Trust, -1.0, feeling.Key)
		require.LessOrEqual(t, feeling.Trust, 1.0, feeling.Key)
	}
}

func TestHowSheFeelsIsAboutHimAndNobodyElse(t *testing.T) {
	// §34's promise: "This is how she is with you, and with nobody else." It
	// lands in relationship traits, which are per person. On the baseline
	// instead, every stranger would meet a character who already adored them.
	besotted := SeedIAI([]string{"warm"}, "besotted")
	indifferent := SeedIAI([]string{"warm"}, "indifferent")

	require.Equal(t, indifferent.Baseline, besotted.Baseline,
		"who she is does not change because of who made her")
	require.Greater(t, besotted.Relationship.Warmth, indifferent.Relationship.Warmth)
	require.Greater(t, besotted.Relationship.Trust, indifferent.Relationship.Trust)
}

func TestNothingHereInventsAPastForHer(t *testing.T) {
	// §35. An earlier version turned "together for years" into seed episodes,
	// which poisons the memory table -- a fabricated episode sits there scored
	// by the same salience as a real Tuesday -- and falls apart the first time
	// she says "remember when" to somebody who does not.
	//
	// The seed is disposition and nothing else. What a creator wanted from
	// years together is how she *is*, and that survives; the past never existed
	// to be given.
	seed := SeedIAI([]string{"warm", "playful", "earnest"}, "besotted")

	require.Greater(t, seed.Relationship.Warmth, 0.9, "she can arrive in love")
	require.NotZero(t, seed.Baseline.Warmth, "and be a warm person besides")
}

func TestFeelingMoreIsAMatterOfDegree(t *testing.T) {
	previous := -1.0
	for _, key := range IAIFeelingKeys() {
		warmth := SeedIAI(nil, key).Relationship.Warmth
		require.Greater(t, warmth, previous, key)
		previous = warmth
	}
}

func TestAnAnswerNobodyRecognisesMakesAPlainerCharacterNotAFailedOne(t *testing.T) {
	// A form that gains an option before this table does should cost somebody a
	// shade of personality, never the character they just spent nine screens on.
	seed := SeedIAI([]string{"warm", "inscrutable"}, "smitten-ish")

	require.Equal(t, SeedIAI([]string{"warm"}, "indifferent").Baseline, seed.Baseline)
	require.Zero(t, seed.Relationship.Warmth)
}

func TestMoreAnswersThanTheFormAllowsAreNotAllCounted(t *testing.T) {
	// §34 asks for three. A caller sending six is a form out of step with this
	// table, and averaging all of them would build a character nobody picked.
	three := SeedIAI([]string{"warm", "playful", "earnest"}, "indifferent")
	six := SeedIAI([]string{"warm", "playful", "earnest", "sharp", "guarded", "quiet"}, "indifferent")

	require.Equal(t, three.Baseline, six.Baseline)
}

func TestAnsweringNothingIsACharacterWithNoOpinionsYet(t *testing.T) {
	seed := SeedIAI(nil, "")

	require.Zero(t, seed.Baseline.Mood)
	require.Zero(t, seed.Baseline.Trust)
	require.Zero(t, seed.Baseline.Warmth)
	require.Zero(t, seed.Baseline.Firmness)
	require.Zero(t, seed.Relationship.Warmth)
}

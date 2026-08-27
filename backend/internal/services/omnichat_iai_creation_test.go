package services

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTheInterestsOnTheFormAreTheOnesTheSpecOffers(t *testing.T) {
	// Same guard the temperaments have. §34 lists these by name and the
	// interface renders whatever this returns; if the two drift, somebody picks
	// something that converts to nothing and gets a blanker character than they
	// chose, with no error anywhere.
	require.Equal(t, []string{
		"games", "music", "film", "reading", "making_things",
		"fitness", "cooking", "going_out", "staying_in",
	}, IAIInterestKeys())
}

func TestSheIsDrawnToThingsRatherThanHavingDoneThem(t *testing.T) {
	// §35. She was made recently, so "has played since she was small" is a past
	// she did not have. Every line here is present tense.
	rendered := renderIAIInterests([]string{"games", "music"})

	require.Equal(t, "Drawn to games and music.", rendered)
	for _, past := range []string{"years", "since", "always", "grew up", "used to"} {
		require.NotContains(t, strings.ToLower(rendered), past)
	}
}

func TestSheIsDrawnToAtMostThree(t *testing.T) {
	// Counting punctuation would be measuring the sentence rather than the
	// picks -- an entry containing its own comma broke exactly that.
	all := renderIAIInterests(IAIInterestKeys())

	matched := 0
	for _, interest := range iaiInterests {
		if strings.Contains(all, interest.Reads) {
			matched++
		}
	}
	require.Equal(t, omniChatIAIInterestPicks, matched,
		"nine answers offered, three of them kept")
}

func TestTheSameInterestTwiceIsOneInterest(t *testing.T) {
	require.Equal(t,
		renderIAIInterests([]string{"music"}),
		renderIAIInterests([]string{"music", "music", "music"}))
}

func TestAnInterestNobodyRecognisesIsSkipped(t *testing.T) {
	require.Equal(t,
		renderIAIInterests([]string{"music"}),
		renderIAIInterests([]string{"music", "spelunking"}))
	require.Empty(t, renderIAIInterests(nil))
	require.Empty(t, renderIAIInterests([]string{"spelunking"}))
}

func TestASlugSurvivesANameItCannotSpell(t *testing.T) {
	// A name in a script with no ASCII still needs a usable identity rather
	// than an empty one. Uniqueness is the repository's job, so this only has
	// to be readable and safe.
	require.Equal(t, "sam", iaiSlugBase("Sam"))
	require.Equal(t, "iai", iaiSlugBase("さくら"))
	require.Equal(t, "anne-marie", iaiSlugBase("  Anne-Marie!!  "))
	require.NotContains(t, iaiSlugBase("A Very Long Name That Somebody Typed Out In Full"), " ")
	require.LessOrEqual(t, len(iaiSlugBase(strings.Repeat("long ", 40))), 48)
}

func TestCreationRefusesWhatItCannotMake(t *testing.T) {
	creator := NewOmniChatIAICreator(nil)

	_, err := creator.Create(t.Context(), 1, IAIAnswers{Name: "Sam"})
	require.Error(t, err, "no repository means creation is unavailable, not silently skipped")

	// And a name is the one thing she cannot be made without.
	unavailable := &OmniChatIAICreator{}
	_, err = unavailable.Create(t.Context(), 1, IAIAnswers{Name: "   "})
	require.Error(t, err)
}

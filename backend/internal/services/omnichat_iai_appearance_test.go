package services

import (
	"sort"
	"testing"

	"github.com/stretchr/testify/require"
)

func fullAppearance() IAIAppearance {
	return IAIAppearance{
		Style: "realistic", Gender: "woman", Age: 27,
		Ethnicity: "latina", Hair: "curly", HairColour: "black", Eyes: "brown", Build: "athletic",
	}
}

func TestTheAppearanceOptionsAreTheOnesTheSpecOffers(t *testing.T) {
	// Same guard the temperaments and interests have. The interface renders
	// whatever this returns, so drift means somebody picks an option that is
	// dropped on the way in and gets a blanker character than they chose.
	options := IAIAppearanceOptions()

	require.Equal(t, []string{"realistic", "anime"}, options["style"])
	require.Equal(t, []string{"woman", "man"}, options["gender"],
		"§34: men and women both, and trans characters are out of scope for now")
	require.Equal(t, []string{"caucasian", "asian", "black", "latina", "arab", "mixed"}, options["ethnicity"])
	require.Equal(t, []string{"straight", "bangs", "curly", "bun", "short", "ponytail"}, options["hair"])
	require.Equal(t, []string{"brunette", "blonde", "black", "red", "dyed"}, options["hair_colour"])
	require.Equal(t, []string{"brown", "blue", "green", "grey", "hazel"}, options["eyes"])
	require.Equal(t, []string{"slim", "athletic", "average", "curvy", "heavy"}, options["build"])
}

func TestTheCallerCannotReorderTheServersOwnTable(t *testing.T) {
	// The order is §34's, and the tests above assert it. Handing out the backing
	// array let one caller sorting for display change the canonical list for
	// everybody afterwards, with nothing to notice it had happened.
	sort.Strings(IAIAppearanceOptions()["style"])

	require.Equal(t, []string{"realistic", "anime"}, IAIAppearanceOptions()["style"])
	require.Equal(t, []string{"realistic", "anime"}, iaiStyles)
}

func TestTheSliderIsDrawnFromTheRuleItEnforces(t *testing.T) {
	// The form renders a slider and the server refuses below its floor. If the
	// interface carried its own copy of 18, the two could disagree and only the
	// server would be right.
	minimum, maximum := IAIAgeRange()

	require.Equal(t, omniChatIAIMinimumAge, minimum)
	require.Equal(t, omniChatIAIMaximumAge, maximum)

	atFloor, err := normaliseIAIAppearance(IAIAppearance{Age: minimum})
	require.NoError(t, err)
	require.Equal(t, minimum, atFloor.Age)

	atCeiling, err := normaliseIAIAppearance(IAIAppearance{Age: maximum})
	require.NoError(t, err)
	require.Equal(t, maximum, atCeiling.Age)

	_, err = normaliseIAIAppearance(IAIAppearance{Age: minimum - 1})
	require.ErrorIs(t, err, ErrIAIUnderage, "one below the floor is refused, not clamped up to it")
}

func TestWhatSheLooksLikeSurvivesIntact(t *testing.T) {
	normalised, err := normaliseIAIAppearance(fullAppearance())

	require.NoError(t, err)
	require.Equal(t, fullAppearance(), normalised)
	require.True(t, normalised.described())
}

func TestAnAnswerNobodyRecognisesCostsADetailRatherThanTheCharacter(t *testing.T) {
	// A form gaining an option before this table does should cost a shade of
	// how she looks, not the character somebody spent nine screens on. Storing
	// it anyway would hand the generator nonsense later.
	appearance := fullAppearance()
	appearance.Hair = "mohawk"
	appearance.Eyes = "violet"

	normalised, err := normaliseIAIAppearance(appearance)

	require.NoError(t, err)
	require.Empty(t, normalised.Hair)
	require.Empty(t, normalised.Eyes)
	require.Equal(t, "curly", fullAppearance().Hair, "and the input is not mutated under the caller")
	require.Equal(t, "latina", normalised.Ethnicity, "everything recognised is kept")
}

func TestAnswersAreReadRegardlessOfHowTheyWereTyped(t *testing.T) {
	normalised, err := normaliseIAIAppearance(IAIAppearance{Style: "  Realistic ", Build: "ATHLETIC"})

	require.NoError(t, err)
	require.Equal(t, "realistic", normalised.Style)
	require.Equal(t, "athletic", normalised.Build)
}

func TestACharacterUnderEighteenIsRefusedRatherThanCorrected(t *testing.T) {
	// The one answer here that is not quietly dropped. §13 permits a "must"
	// where somebody is kept safe, and silently rounding an age up would tell
	// the person their answer was accepted.
	appearance := fullAppearance()
	appearance.Age = 16

	_, err := normaliseIAIAppearance(appearance)

	require.ErrorIs(t, err, ErrIAIUnderage)
}

func TestAnAgeAboveTheSliderComesBackToTheTop(t *testing.T) {
	// Nothing on the form can send this, so it is somebody hitting the endpoint
	// directly. The top of the slider is a real age, not a bucket, so this is a
	// value out of range rather than a coarser way of saying the same thing.
	appearance := fullAppearance()
	appearance.Age = 200

	normalised, err := normaliseIAIAppearance(appearance)

	require.NoError(t, err)
	require.Equal(t, omniChatIAIMaximumAge, normalised.Age)
	require.Equal(t, 99, omniChatIAIMaximumAge, "§34's slider runs 18 to 99")
}

func TestNobodyAnsweringLooksNothingLikeAnsweringBlank(t *testing.T) {
	// An empty object stored would read later as "asked and declined". Nothing
	// stored reads as "never asked", which is what actually happened.
	normalised, err := normaliseIAIAppearance(IAIAppearance{})

	require.NoError(t, err)
	require.False(t, normalised.described())

	// An age of zero is nobody answering, not a newborn.
	unanswered, err := normaliseIAIAppearance(IAIAppearance{Age: 0})
	require.NoError(t, err)
	require.False(t, unanswered.described())
}

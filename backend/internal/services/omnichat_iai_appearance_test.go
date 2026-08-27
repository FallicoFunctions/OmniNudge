package services

import (
	"sort"
	"testing"

	"github.com/stretchr/testify/require"
)

func fullAppearance() IAIAppearance {
	return IAIAppearance{
		Style: "realistic", Gender: "woman", Age: 27, HeightInches: 65,
		Ethnicity: "latino", HairLength: "long", HairTexture: "wavy",
		HairStyle: "high_ponytail", HairColour: "dark_brown", Eyes: "amber", Build: "athletic",
	}
}

func TestTheAppearanceOptionsAreTheOnesTheSpecOffers(t *testing.T) {
	// The interface renders whatever this returns, so drift means somebody picks
	// an option that is dropped on the way in and gets a blanker character than
	// they chose.
	options := IAIAppearanceOptions()

	require.Equal(t, []string{"realistic", "anime"}, options["style"])
	require.Equal(t, []string{"woman", "man"}, options["gender"],
		"§34: men and women both, and trans characters are out of scope for now")
	require.Equal(t, []string{
		"white", "black", "east_asian", "south_asian", "southeast_asian",
		"latino", "middle_eastern", "pacific_islander", "indigenous", "mixed", "other",
	}, options["ethnicity"])
	require.Equal(t, []string{"shaved", "buzzed", "short", "medium", "long", "very_long"}, options["hair_length"])
	require.Equal(t, []string{"straight", "wavy", "curly", "coily"}, options["hair_texture"])
	require.Len(t, options["hair_colour"], 16)
	require.Contains(t, options["hair_colour"], "auburn")
	require.NotContains(t, options["hair_colour"], "brunette", "that describes a person, not a colour")
	require.NotContains(t, options["hair_colour"], "dyed", "how a colour got there is not a colour")

	// The three that depend on another answer are deliberately absent; they have
	// their own functions, because offering them flat would offer combinations
	// that cannot exist.
	require.NotContains(t, options, "eyes")
	require.NotContains(t, options, "build")
	require.NotContains(t, options, "hair_style")
}

func TestTheCallerCannotReorderTheServersOwnTable(t *testing.T) {
	// The order is §34's, and the tests above assert it. Handing out the backing
	// array let one caller sorting for display change the canonical list for
	// everybody afterwards, with nothing to notice it had happened.
	sort.Strings(IAIAppearanceOptions()["style"])

	require.Equal(t, []string{"realistic", "anime"}, IAIAppearanceOptions()["style"])
	require.Equal(t, []string{"realistic", "anime"}, iaiStyles)
}

func TestTheSlidersAreDrawnFromTheRulesTheyEnforce(t *testing.T) {
	minimumAge, maximumAge := IAIAgeRange()
	require.Equal(t, omniChatIAIMinimumAge, minimumAge)
	require.Equal(t, omniChatIAIMaximumAge, maximumAge)

	minimumHeight, maximumHeight := IAIHeightRange()
	require.Equal(t, 58, minimumHeight, "4 feet 10 inches: short adults, and no height only a child has")
	require.Equal(t, 84, maximumHeight)

	atFloor, err := normaliseIAIAppearance(IAIAppearance{Age: minimumAge, HeightInches: minimumHeight})
	require.NoError(t, err)
	require.Equal(t, minimumAge, atFloor.Age)
	require.Equal(t, minimumHeight, atFloor.HeightInches)

	_, err = normaliseIAIAppearance(IAIAppearance{Age: minimumAge - 1})
	require.ErrorIs(t, err, ErrIAIUnderage, "one below the floor is refused, not clamped up to it")
}

func TestWhatSheLooksLikeSurvivesIntact(t *testing.T) {
	normalised, err := normaliseIAIAppearance(fullAppearance())

	require.NoError(t, err)
	require.Equal(t, fullAppearance(), normalised)
	require.True(t, normalised.described())
}

func TestAnAnswerNobodyRecognisesCostsADetailRatherThanTheCharacter(t *testing.T) {
	appearance := fullAppearance()
	appearance.HairColour = "chartreuse"
	appearance.Ethnicity = "martian"

	normalised, err := normaliseIAIAppearance(appearance)

	require.NoError(t, err)
	require.Empty(t, normalised.HairColour)
	require.Empty(t, normalised.Ethnicity)
	require.Equal(t, "latino", fullAppearance().Ethnicity, "and the input is not mutated under the caller")
	require.Equal(t, "amber", normalised.Eyes, "everything recognised is kept")
}

func TestAnswersAreReadRegardlessOfHowTheyWereTyped(t *testing.T) {
	normalised, err := normaliseIAIAppearance(IAIAppearance{Style: "  Realistic ", Gender: "WOMAN", Build: "Curvy"})

	require.NoError(t, err)
	require.Equal(t, "realistic", normalised.Style)
	require.Equal(t, "woman", normalised.Gender)
	require.Equal(t, "curvy", normalised.Build)
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

func TestAnAnswerAboveASliderComesBackToItsTop(t *testing.T) {
	// Nothing on the form can send these, so it is somebody hitting the endpoint
	// directly. Both tops are real values rather than buckets.
	appearance := fullAppearance()
	appearance.Age = 200
	appearance.HeightInches = 300

	normalised, err := normaliseIAIAppearance(appearance)

	require.NoError(t, err)
	require.Equal(t, 99, normalised.Age)
	require.Equal(t, 84, normalised.HeightInches)

	appearance.HeightInches = 20
	shortened, err := normaliseIAIAppearance(appearance)
	require.NoError(t, err)
	require.Equal(t, 58, shortened.HeightInches, "and below the floor comes back up rather than through")
}

func TestNobodyAnsweringLooksNothingLikeAnsweringBlank(t *testing.T) {
	// An empty object stored would read later as "asked and declined". Nothing
	// stored reads as "never asked", which is what actually happened.
	normalised, err := normaliseIAIAppearance(IAIAppearance{})

	require.NoError(t, err)
	require.False(t, normalised.described())

	unanswered, err := normaliseIAIAppearance(IAIAppearance{Age: 0, HeightInches: 0})
	require.NoError(t, err)
	require.False(t, unanswered.described())
}

func TestUnnaturalEyesBelongToDrawingsOnly(t *testing.T) {
	// On a realistic character, violet is a claim about a person that is not
	// true of any person. On anime the drawing is already not claiming to be a
	// photograph.
	require.NotContains(t, IAIEyeColours("realistic"), "violet")
	require.Contains(t, IAIEyeColours("anime"), "violet")
	require.Contains(t, IAIEyeColours("realistic"), "amber", "which is a colour people actually have")

	drawn, err := normaliseIAIAppearance(IAIAppearance{Style: "anime", Eyes: "violet"})
	require.NoError(t, err)
	require.Equal(t, "violet", drawn.Eyes)

	photographic, err := normaliseIAIAppearance(IAIAppearance{Style: "realistic", Eyes: "violet"})
	require.NoError(t, err)
	require.Empty(t, photographic.Eyes, "the style is answered before the eyes, so this cannot come from the form")
}

func TestTheSilhouettesOfferedAreTheOnesThatMeanSomething(t *testing.T) {
	require.Contains(t, IAIBuilds("woman"), "curvy")
	require.Contains(t, IAIBuilds("man"), "stocky")
	require.NotContains(t, IAIBuilds("man"), "curvy", "it says nothing useful about a man's shape")
	require.NotContains(t, IAIBuilds("woman"), "heavy", "plus_size describes a body; heavy judges it")

	require.NotContains(t, IAIBuilds("woman"), "petite",
		"that was height wearing a build's clothes, and height is its own answer now")

	wrong, err := normaliseIAIAppearance(IAIAppearance{Gender: "man", Build: "curvy"})
	require.NoError(t, err)
	require.Empty(t, wrong.Build)
}

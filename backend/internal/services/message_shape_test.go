package services

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

func TestOnlyACharacterWhoseShapeSomebodyChoseIsHeldToOne(t *testing.T) {
	for _, testCase := range []struct {
		profile string
		counts  bool
		why     string
	}{
		{models.ResponseStyleProfileNaturalDialogue, true, "a roleplay character's shape was picked for her"},
		{models.ResponseStyleProfileProfessional, true, "same, in a different register"},
		{models.ResponseStyleProfileInherit, true, "inherit resolves to natural dialogue"},
		{models.ResponseStyleProfileDirectMessage, false, "an IAI is offered the notation and no count"},
		{models.ResponseStyleProfileLeanNarrative, false, "never carried the count"},
		{models.ResponseStyleProfileCharacterOnly, false, "an imported card is left alone"},
	} {
		t.Run(testCase.profile, func(t *testing.T) {
			shape := personaMessageShape(&models.BotPersona{ResponseStyleProfile: testCase.profile})
			require.Equal(t, testCase.counts, shape.countsBlocks(), testCase.why)
		})
	}
}

func TestAShapeThatCountsNothingRefusesNothing(t *testing.T) {
	// One block or five: both fine when nobody chose a number. This is the whole
	// point of the split. The notation is available, the count is not imposed.
	for _, response := range []string{
		"One long paragraph that simply keeps going and says what it came to say.",
		strings.Join([]string{"One.", "Two.", "Three.", "Four.", "Five."}, "\n\n"),
	} {
		valid, detail := meetsConversationalLengthBudget(response, messageShape{})
		require.True(t, valid, detail)
	}
}

func TestThePersonalShapeStillRefusesWhatItAlwaysRefused(t *testing.T) {
	single := "Just the one block, which personal mode has never accepted on its own."
	valid, detail := meetsConversationalLengthBudget(single, personalConversationShape)
	require.False(t, valid)
	require.Contains(t, detail, "required 2 to 4",
		"people read this wording; it has to survive the numbers becoming data")
}

func TestTheWordLimitIsNotPartOfTheShape(t *testing.T) {
	// The count came out of the bundle. The hundred-word cap did not, and
	// removing one must not quietly remove the other.
	long := strings.TrimSpace(strings.Repeat("word ", 120))
	valid, detail := meetsConversationalLengthBudget(long, messageShape{})
	require.False(t, valid)
	require.Contains(t, detail, "words")
}

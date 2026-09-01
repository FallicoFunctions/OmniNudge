package services

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

func omniAIPersona() *models.BotPersona {
	return &models.BotPersona{ResponseStyleProfile: models.ResponseStyleProfileDirectMessage}
}

func TestSheIsToldTheDayTheDateAndTheTime(t *testing.T) {
	moment := renderCurrentMoment(omniAIPersona(), time.Date(2026, time.August, 26, 15, 37, 0, 0, time.UTC))

	require.Contains(t, moment, "[Right Now]")
	require.Contains(t, moment, "Wednesday")
	require.Contains(t, moment, "26 August 2026")
	require.Contains(t, moment, "3:37pm",
		"she keeps arrangements to the minute in §5")
	require.NotContains(t, moment, "afternoon",
		"how she thinks about the time is hers; the block carries the fact and no framing")
}

func TestThePromptOnlyCarriesAClockWhenSomebodyHandsItOne(t *testing.T) {
	// The prompt builder must not read the clock itself. The persona fingerprint
	// hashes assembled prompts, and a prompt carrying the current minute hashes
	// differently every minute: the approval gate becomes unapprovable and every
	// test asserting prompt text fails one run in sixty. It passes today only
	// because no companion fixture is direct_message, which is not a guarantee.
	persona := omniAIPersona()
	persona.SystemPrompt = "You are someone."

	first := buildConversationSystemPrompt(persona, nil, nil)
	second := buildConversationSystemPrompt(persona, nil, nil)

	require.Equal(t, first, second)
	require.NotContains(t, first, "[Right Now]",
		"the preview and fingerprint path is deliberately timeless")

	// And the live path does carry it, or the whole block would be dead.
	withClock := buildConversationSystemPromptWithDisposition(persona, nil, nil, nil, promptRecall{},
		models.OmniChatDisposition{}, time.Date(2026, time.August, 26, 18, 55, 0, 0, time.UTC))
	require.Contains(t, withClock, "[Right Now]")
	require.Contains(t, withClock, "6:55pm")
}

func TestOnlyACharacterWhoLivesHereIsToldTheDate(t *testing.T) {
	now := time.Date(2026, time.August, 26, 15, 0, 0, 0, time.UTC)

	require.NotEmpty(t, renderCurrentMoment(omniAIPersona(), now))

	// A roleplay character's scene may be set somewhere 2026 contradicts, and
	// handing her the real date would break what her creator built.
	for _, profile := range []string{
		models.ResponseStyleProfileNaturalDialogue,
		models.ResponseStyleProfileLeanNarrative,
		models.ResponseStyleProfileCharacterOnly,
		models.ResponseStyleProfileProfessional,
	} {
		require.Empty(t,
			renderCurrentMoment(&models.BotPersona{ResponseStyleProfile: profile}, now), profile)
	}
	require.Empty(t, renderCurrentMoment(nil, now))
}

func TestAClockThatIsNotSetSaysNothing(t *testing.T) {
	// Better to say nothing than to tell her it is the first of January in the
	// year one with complete confidence.
	require.Empty(t, renderCurrentMoment(omniAIPersona(), time.Time{}))
}

func TestSheCanTellSixFiftyFiveFromSevenThirty(t *testing.T) {
	// The case §5 is built on: she has an arrangement at seven and it is nearly
	// seven, so she says so. A block that only knew "the evening" could not.
	before := renderCurrentMoment(omniAIPersona(), time.Date(2026, time.August, 26, 18, 55, 0, 0, time.UTC))
	after := renderCurrentMoment(omniAIPersona(), time.Date(2026, time.August, 26, 19, 30, 0, 0, time.UTC))

	require.Contains(t, before, "6:55pm")
	require.Contains(t, after, "7:30pm")
	require.NotEqual(t, before, after)
}

func TestTheTimeIsHersRatherThanTheReaders(t *testing.T) {
	// We do not know where he is. Inventing his timezone would have her saying
	// good morning at his midnight, with total confidence.
	moment := renderCurrentMoment(omniAIPersona(), time.Date(2026, time.August, 26, 9, 0, 0, 0, time.UTC))
	require.True(t, strings.Contains(moment, "where you are"),
		"the line has to say whose clock this is, or it reads as a claim about his")
}

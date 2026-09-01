package services

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

func TestOnlyACharacterWhoChoosesHerOwnShapeArrivesInPieces(t *testing.T) {
	for _, testCase := range []struct {
		profile  string
		separate bool
		why      string
	}{
		{models.ResponseStyleProfileDirectMessage, true, "an OmniAI writes the breaks and means them"},
		{models.ResponseStyleProfileNaturalDialogue, false, "her creator has not chosen this yet"},
		{models.ResponseStyleProfileLeanNarrative, false, "narration is not a burst of texts"},
		{models.ResponseStyleProfileCharacterOnly, false, "an imported card is left alone"},
	} {
		t.Run(testCase.profile, func(t *testing.T) {
			require.Equal(t, testCase.separate,
				personaDeliversSeparateMessages(&models.BotPersona{ResponseStyleProfile: testCase.profile}),
				testCase.why)
		})
	}
	require.False(t, personaDeliversSeparateMessages(nil))
}

func TestAReplyWithNoBreakIsStillOneMessage(t *testing.T) {
	// The ordinary case, and the one that must not change: a single paragraph
	// is one message, not one message wearing a list.
	messages := splitDeliverableMessages("Just the one thing, said once.")
	require.Equal(t, []string{"Just the one thing, said once."}, messages)
}

func TestSheGetsTheMessagesSheWrote(t *testing.T) {
	messages := splitDeliverableMessages("wait\n\nwhat did he say\n\nno seriously")
	require.Equal(t, []string{"wait", "what did he say", "no seriously"}, messages)
}

func TestBlankRunsAndStrayWhitespaceDoNotBecomeEmptyMessages(t *testing.T) {
	messages := splitDeliverableMessages("  first  \n\n\n\n   \n\n second \n\n   ")
	require.Equal(t, []string{"first", "second"}, messages)
	require.Empty(t, splitDeliverableMessages("   \n\n  "))
}

func TestATailBeyondTheCapIsJoinedRatherThanLost(t *testing.T) {
	written := make([]string, 0, 10)
	for index := range 10 {
		written = append(written, string(rune('a'+index)))
	}
	messages := splitDeliverableMessages(strings.Join(written, "\n\n"))

	require.Len(t, messages, omniChatMaxDeliveredMessages)
	// Everything she wrote is still there. Nobody sends ten texts about one
	// thing, but dropping the end of what she said would be worse than a long
	// last message.
	require.Equal(t, strings.Join(written, "\n\n"), strings.Join(messages, "\n\n"))
}

func TestALongerMessageTakesLongerToArrive(t *testing.T) {
	short := typingPause("ok")
	long := typingPause(strings.TrimSpace(strings.Repeat("word ", 12)))

	require.Greater(t, long, short,
		"a burst arriving at a constant rate reads as a machine dealing cards")
	require.GreaterOrEqual(t, short, omniChatTypingPauseFloor,
		"even a two-letter reply takes a moment to follow the one before it")
	require.LessOrEqual(t, typingPause(strings.Repeat("word ", 500)), omniChatTypingPauseCeiling,
		"one long block must not hold up the rest of what she is saying")
}

func TestTheDeliveryContextOutlastsTheWorstCasePacing(t *testing.T) {
	// The messages are persisted as they come due, so the context covers the
	// whole burst. If the pacing could outrun it, her last message would be the
	// one that never arrives.
	require.GreaterOrEqual(t,
		assistantPersistenceTimeout+omniChatMaxDeliverySpread,
		time.Duration(omniChatMaxDeliveredMessages)*omniChatTypingPauseCeiling+assistantPersistenceTimeout)
}

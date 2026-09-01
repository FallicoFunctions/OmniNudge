package services

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

func userSaid(lines ...string) []*models.BotMessage {
	history := make([]*models.BotMessage, 0, len(lines))
	for _, line := range lines {
		history = append(history, &models.BotMessage{Role: models.BotMessageRoleUser, Content: line})
	}
	return history
}

func repeatedly(line string, times int) []string {
	lines := make([]string, 0, times)
	for range times {
		lines = append(lines, line)
	}
	return lines
}

func TestAStyleIsNotReadFromTooFewMessages(t *testing.T) {
	style := observeUserWritingStyle(userSaid("hey", "you around"))

	require.False(t, style.sufficient(), "two messages is a mood, not a habit")
	require.Empty(t, renderMirroredStyle(style), "and nothing is said about it")
}

func TestSheIsToldWhatWasCountedRatherThanWhatItSeemedLike(t *testing.T) {
	style := observeUserWritingStyle(userSaid(repeatedly("yeah ok sounds good to me", 10)...))
	require.True(t, style.sufficient())

	rendered := renderMirroredStyle(style)
	require.Contains(t, rendered, "[How They Write]")
	require.Contains(t, rendered, "about 6 words")
	require.Contains(t, rendered, "Do not shrink so far that you stop answering.")
}

func TestSomebodyWhoNeverWritesActionsStopsGettingThem(t *testing.T) {
	plain := observeUserWritingStyle(userSaid(repeatedly("just talking normally here", 10)...))
	require.False(t, plain.UsesAsterisks)
	require.Contains(t, renderMirroredStyle(plain), "Do not write any either")

	roleplayer := observeUserWritingStyle(userSaid(repeatedly("*leans in* what are you doing", 10)...))
	require.True(t, roleplayer.UsesAsterisks)
	require.Contains(t, renderMirroredStyle(roleplayer), "normal here")
}

func TestOneStrayAsteriskIsATypoAndNotAWayOfWriting(t *testing.T) {
	lines := repeatedly("no asterisks at all in this one", 19)
	lines = append(lines, "oops *")

	style := observeUserWritingStyle(userSaid(lines...))
	require.False(t, style.UsesAsterisks,
		"one in twenty is a slip; reading it as a habit would put narration back on somebody who never asked for it")
}

func TestLowercaseIsNoticedOnlyWhenItIsTheHabit(t *testing.T) {
	lowered := observeUserWritingStyle(userSaid(repeatedly("nah i dont think so honestly", 10)...))
	require.True(t, lowered.MostlyLowered)
	require.Contains(t, renderMirroredStyle(lowered), "do not capitalise")

	mixed := observeUserWritingStyle(userSaid(
		append(repeatedly("Yes that sounds right to me", 6), repeatedly("no i disagree", 4)...)...))
	require.False(t, mixed.MostlyLowered)
	require.NotContains(t, renderMirroredStyle(mixed), "do not capitalise")
}

func TestMirroringLeansAndStopsAtTheFloor(t *testing.T) {
	terse := observeUserWritingStyle(userSaid(repeatedly("k", 12)...))
	require.True(t, terse.sufficient())

	shaped := mirroredShape(personalConversationShape, terse)

	require.Less(t, shaped.maxBlockWords, personalConversationShape.maxBlockWords,
		"she moves toward how he writes")
	require.GreaterOrEqual(t, shaped.maxBlockWords, omniChatMirrorFloorWords,
		"and stops before she is answering 'k' to everything")
	require.Equal(t, 1, shaped.minBlocks,
		"somebody writing one word does not want three paragraphs back")
}

func TestMirroringNeverLoosensWhatTheCreatorChose(t *testing.T) {
	verbose := observeUserWritingStyle(userSaid(repeatedly(strings.TrimSpace(strings.Repeat("word ", 90)), 10)...))

	shaped := mirroredShape(personalConversationShape, verbose)

	require.LessOrEqual(t, shaped.maxBlockWords, personalConversationShape.maxBlockWords,
		"a long-winded reader does not unlock a longer character than her creator allowed")
}

func TestAnUnshapedOrUnsampledCharacterIsLeftAlone(t *testing.T) {
	terse := observeUserWritingStyle(userSaid(repeatedly("k", 12)...))

	require.Equal(t, messageShape{}, mirroredShape(messageShape{}, terse),
		"nothing to lean when nobody chose a shape")
	require.Equal(t, personalConversationShape,
		mirroredShape(personalConversationShape, observeUserWritingStyle(userSaid("k", "k"))),
		"and nothing to lean on until there is a sample")
}

func TestOnlyARoleplayCharacterMirrors(t *testing.T) {
	require.True(t, personaMirrorsUser(&models.BotPersona{
		ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue,
		MessageStyleMode:     models.MessageStyleModeMirror,
	}))
	require.False(t, personaMirrorsUser(&models.BotPersona{
		ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue,
		MessageStyleMode:     models.MessageStyleModeDefault,
	}))
	// The schema refuses this row; refusing it here too means a bad row cannot
	// make the platform choose an OmniAI's style for her.
	require.False(t, personaMirrorsUser(&models.BotPersona{
		ResponseStyleProfile: models.ResponseStyleProfileDirectMessage,
		MessageStyleMode:     models.MessageStyleModeMirror,
	}))
	require.False(t, personaMirrorsUser(nil))
}

func TestOnlyTheirOwnWritingIsCounted(t *testing.T) {
	history := userSaid(repeatedly("k", 10)...)
	for range 10 {
		history = append(history, &models.BotMessage{
			Role:    models.BotMessageRoleAssistant,
			Content: strings.TrimSpace(strings.Repeat("word ", 40)),
		})
	}

	style := observeUserWritingStyle(history)

	require.Equal(t, 10, style.Sampled)
	require.InDelta(t, 1.0, style.AverageWords, 0.001,
		"counting her own replies would make mirroring a loop she converges on herself in")
}

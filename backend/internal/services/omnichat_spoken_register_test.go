package services

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

// The reply that started this, exactly as she wrote it on a call.
const narratedReply = "*I let out a slow, dry laugh, shaking my head as your pace picks up.*\n\n" +
	"You want me to do all the work while you just sit there? Keep dreaming."

func TestSpokenTextRemovesTheNarration(t *testing.T) {
	require.Equal(t,
		"You want me to do all the work while you just sit there? Keep dreaming.",
		SpokenText(narratedReply))
}

// Narration in the middle of speech, which is the harder shape: removing it
// must not weld the two halves of the sentence together.
func TestSpokenTextLeavesTheWordsAroundItReadable(t *testing.T) {
	spoken := SpokenText("Come here. *she leans in* I want to tell you something.")

	require.NotContains(t, spoken, "*")
	require.NotContains(t, spoken, "leans in")
	require.Contains(t, spoken, "Come here.")
	require.Contains(t, spoken, "I want to tell you something.")
	require.NotContains(t, spoken, "  ", "removal left a double space in the middle of a sentence")
}

// A turn that is nothing but narration has nothing to say out loud. The caller
// needs to be able to tell, so it comes back empty rather than as whitespace.
func TestSpokenTextIsEmptyWhenThereIsNothingToSay(t *testing.T) {
	for _, narration := range []string{
		"*she smiles*",
		"*she smiles*\n\n*and looks away*",
		"   *nods*   ",
		"",
	} {
		require.Empty(t, SpokenText(narration))
	}
}

// Ordinary speech survives untouched. An asterisk is only a stage direction
// when it wraps something.
func TestSpokenTextLeavesRealSpeechAlone(t *testing.T) {
	for _, speech := range []string{
		"I said no. Twice.",
		"It cost 5 * 3 dollars, roughly.",
		"Are you there?",
	} {
		require.Equal(t, speech, SpokenText(speech))
	}
}

// The instruction only appears when she is actually on a call, and it is last
// so a persona's own post-history instructions cannot outrank it.
func TestTheSpokenRegisterIsAppliedOnlyOnACall(t *testing.T) {
	base := "You are Sadie.\n\n[Post-History Instructions]\nStay in character."

	require.Equal(t, base, withSpokenRegister(base, false))

	onACall := withSpokenRegister(base, true)
	require.Contains(t, onACall, "[Spoken Conversation]")
	require.True(t, len(onACall) > len(base))
	require.Contains(t, onACall[len(base):], "spoken aloud",
		"the call register has to come after the persona's own instructions")
}

// The assembled prompt, not the helper.
//
// This asserted only that withSpokenRegister appends, and passed while the real
// prompt carried six thousand characters after the call register -- including
// the response-style block's own rules on length and closing questions, written
// for somebody reading rather than listening. The helper was never the thing
// that mattered.
func TestTheCallRegisterIsTheLastThingTheModelReads(t *testing.T) {
	persona := &models.BotPersona{Name: "Sadie", Personality: "blunt"}
	build := func(onACall bool) string {
		return buildConversationSystemPromptWithDisposition(
			persona, nil, nil, nil, promptRecall{}, models.OmniChatDisposition{}, time.Time{}, onACall)
	}

	require.NotContains(t, build(false), "[Spoken Conversation]",
		"a typed turn was told it was on a call")

	onACall := build(true)
	require.True(t, strings.HasSuffix(strings.TrimSpace(onACall), strings.TrimSpace(spokenRegisterInstruction)),
		"something is appended after the call register, so the last word on how to answer is not the medium")
}

// It says what to do, not only what to avoid: "no asterisks" invites a model to
// narrate without them, which keeps the narration and loses the only marker
// that it was narration.
func TestTheSpokenRegisterAsksForSpeechRatherThanForbiddingMarkup(t *testing.T) {
	require.Contains(t, spokenRegisterInstruction, "Write only the words you say out loud")
	require.Contains(t, spokenRegisterInstruction, "third person")
	require.Contains(t, spokenRegisterInstruction, "a sentence or three")
}

// callStateFake stands in for the call session table.
type callStateFake struct {
	onACall bool
	asked   int
}

func (f *callStateFake) ConversationIsOnACall(_ context.Context, _ int) bool {
	f.asked++
	return f.onACall
}

// The gate, not the function.
//
// withSpokenRegister works when it is called, and that says nothing about
// whether a real turn calls it. The reply is generated long after the send
// returned, so nothing in the request carries the medium -- the service has to
// go and ask, and if it stops asking every call goes back to prose with stage
// directions in it.
func TestAServiceWithoutACallReaderSpeaksInProse(t *testing.T) {
	service := &ChatbotService{}

	require.False(t, service.onACall(context.Background(), 27),
		"an unwired reader must not claim she is on the phone")
}

func TestTheServiceAsksTheCallSessionWhetherSheIsSpeaking(t *testing.T) {
	calls := &callStateFake{onACall: true}
	service := (&ChatbotService{}).SetCallState(calls)

	require.True(t, service.onACall(context.Background(), 27))
	require.Equal(t, 1, calls.asked, "the service answered without asking")

	calls.onACall = false
	require.False(t, service.onACall(context.Background(), 27))
}

// The main has to hand the reader over, and it did not for the whole of the
// feature's first life -- the setter existed and nothing called it, so every
// call was still prose. Source-level, because the wiring lives in a main this
// package cannot construct.
func TestTheServerGivesTheChatbotItsCallReader(t *testing.T) {
	source, err := os.ReadFile(filepath.Join("..", "..", "cmd", "server", "main.go"))
	require.NoError(t, err)

	require.Contains(t, string(source), "SetCallState(",
		"the API server builds the chatbot service without a call reader, so every call answers in prose")
}

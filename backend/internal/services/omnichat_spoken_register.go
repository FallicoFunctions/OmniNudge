package services

import (
	"regexp"
	"strings"
)

// She is on the phone, so she talks like somebody on the phone.
//
// A call posts through the ordinary send endpoint, so nothing told the
// generator the medium had changed and she answered in her writing voice:
// "*I let out a slow, dry laugh, shaking my head as your pace picks up.*" --
// a stage direction, in a conversation where the only channel is her voice.
// Text-to-speech then read it out, narrator and all.
//
// It cost time as well as sense. A written turn is long, and a call waits for
// the whole reply before a single word is spoken, then waits again while the
// whole thing is synthesised.

// spokenRegisterInstruction is appended last, after the post-history block, so
// nothing in a persona's own instructions can outrank it.
//
// It says what to do rather than only what to avoid. "No asterisks" invites a
// model to narrate without them, which is worse: the narration survives and the
// only marker that it was narration is gone.
const spokenRegisterInstruction = "\n\n[Spoken Conversation]\n" +
	"You are on a live call. Every word you produce is spoken aloud by your own voice, and nothing else reaches the other person: " +
	"no text, no formatting, no description of what you are doing.\n" +
	"Write only the words you say out loud, exactly as you would say them.\n" +
	"Never write an action, a gesture, an expression, or a description of yourself or the room -- not in asterisks, not in brackets, and not as a sentence about yourself in the third person.\n" +
	"Keep it to what somebody actually says in one turn of a phone call: a sentence or three, not a paragraph. " +
	"You are talking with someone, not performing at them, so leave room for them to answer."

// withSpokenRegister appends the call instruction to a system prompt.
func withSpokenRegister(prompt string, onACall bool) string {
	if !onACall {
		return prompt
	}
	return prompt + spokenRegisterInstruction
}

// stageDirection matches the narration a model produces when it slips.
//
// Asterisk spans are the common form and the only one worth removing
// mechanically: bracketed asides are rarer and square brackets appear in
// ordinary speech about lists and quotations, so removing those would eat real
// words. The prompt is what stops the rest; this is the guard for when it does
// not, because one leaked stage direction is a voice reading "she laughs" in
// her own voice.
var stageDirection = regexp.MustCompile(`\*[^*]*\*`)

// collapseBlankRuns tidies what removal leaves behind.
var collapseBlankRuns = regexp.MustCompile(`\n{3,}`)

// collapseSpaceRuns closes the gap a removed stage direction leaves inside a
// sentence: "Come here. *she leans in* I want to" becomes two spaces where one
// belongs. Runs only, so ordinary text is untouched.
var collapseSpaceRuns = regexp.MustCompile(`[ \t]{2,}`)

// SpokenText strips stage directions from a reply before it is synthesised.
//
// Applied to what is spoken, never to what is stored: the message keeps what
// she actually said, so a transcript read later is not quietly different from
// the conversation that happened.
//
// A reply that is nothing but stage directions comes back empty, and an empty
// reply must not be sent to a synthesiser -- the caller decides what to do with
// that, because "say nothing" and "say the original" are both defensible and
// only the caller knows which.
func SpokenText(reply string) string {
	stripped := stageDirection.ReplaceAllString(reply, "")
	lines := strings.Split(stripped, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRight(line, " \t")
	}
	stripped = strings.Join(lines, "\n")
	stripped = collapseSpaceRuns.ReplaceAllString(stripped, " ")
	stripped = collapseBlankRuns.ReplaceAllString(stripped, "\n\n")
	return strings.TrimSpace(stripped)
}

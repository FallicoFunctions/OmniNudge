package services

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// streamed pushes a reply the way a provider delivers it: a few characters at a
// time, on no particular boundary. A splitter that only works when whole
// sentences arrive at once is a splitter that never works in production.
func streamed(t *testing.T, reply string, chunk int) []string {
	t.Helper()
	spoken := []string{}
	stream := newSentenceStream(func(sentence string) { spoken = append(spoken, sentence) })
	runes := []rune(reply)
	for i := 0; i < len(runes); i += chunk {
		end := i + chunk
		if end > len(runes) {
			end = len(runes)
		}
		stream.push(string(runes[i:end]))
	}
	stream.flush()
	return spoken
}

// A short opening sentence is spoken on its own.
//
// This is the whole feature. "Hey.", "I know.", "Really?" is how a reply on a
// phone call begins, and a minimum sentence length glued every one of them to
// the sentence after it -- so her first word waited for the second sentence to
// finish, which is exactly the delay this exists to remove.
func TestAShortOpenerIsSpokenOnItsOwn(t *testing.T) {
	require.Equal(t,
		[]string{"Hey.", "I missed you today."},
		streamed(t, "Hey. I missed you today.", 3))

	require.Equal(t,
		[]string{"Really?", "That's amazing!", "Tell me everything."},
		streamed(t, "Really? That's amazing! Tell me everything.", 7))
}

// "No." is a sentence.
//
// It is also the abbreviation for "number", and it was on the abbreviation list
// for exactly that reason -- which meant the commonest one-word answer on a
// telephone could never be said on its own. This is the cost of the list, and
// it is why the list is short.
func TestNoIsASentenceRatherThanAnAbbreviation(t *testing.T) {
	require.Equal(t,
		[]string{"No.", "I don't think so."},
		streamed(t, "No. I don't think so.", 2))

	require.Equal(t,
		[]string{"It cost fifty quid.", "No.", "Sixty."},
		streamed(t, "It cost fifty quid. No. Sixty.", 3))
}

// A full stop after an abbreviation does not end a sentence.
//
// Without this she says "I went to see Mister." and then, as a separate
// utterance, "Yang about the roof." The minimum length that used to be here hid
// this rather than fixing it: it measured the buffer instead of looking at the
// word, so the same reply split correctly or incorrectly depending only on how
// far into the sentence the abbreviation fell.
func TestAnAbbreviationDoesNotEndASentence(t *testing.T) {
	require.Equal(t,
		[]string{"I went to see Mr. Yang about the roof."},
		streamed(t, "I went to see Mr. Yang about the roof.", 2))

	// A single letter is an initial, not a sentence.
	require.Equal(t,
		[]string{"That was written by J. R. Tolkien I think."},
		streamed(t, "That was written by J. R. Tolkien I think.", 2))

	// And a decimal point is not a full stop, because nothing follows it but a
	// digit.
	require.Equal(t,
		[]string{"It was 3.5 degrees out there.", "I nearly froze."},
		streamed(t, "It was 3.5 degrees out there. I nearly froze.", 2))
}

// A clause with no terminator is broken on a whole word.
//
// Breaking at whatever rune happens to be number 320 split "extraordinary" into
// "ext" and "raordinary", and a synthesiser handed "raordinary" says it.
func TestAnOverlongClauseBreaksOnAWholeWord(t *testing.T) {
	filler := ""
	for len([]rune(filler)) < 316 {
		filler += "a"
	}
	spoken := streamed(t, filler+" extraordinary thing happened.", 7)

	require.Len(t, spoken, 2)
	require.Equal(t, filler, spoken[0])
	require.Equal(t, "extraordinary thing happened.", spoken[1],
		"a word cut in half is a word the synthesiser reads out in half")
}

// Narration is never spoken, and never cut in half.
//
// The closing asterisk is what tells SpokenText where a stage direction ends.
// Splitting inside one leaves the words in it to be read aloud in her own
// voice.
func TestNarrationIsStrippedAndNeverSplit(t *testing.T) {
	require.Equal(t,
		[]string{"Oh, stop it.", "I mean it.", "Tell me more."},
		streamed(t, "*she laughs* Oh, stop it. I mean it. *she leans back* Tell me more.", 4))

	require.Empty(t, streamed(t, "*she smiles and looks away*", 4),
		"a turn that is only narration has nothing to say aloud")
}

// A turn that is abandoned says no more. Speech cannot be unsaid, so a stream
// that stops must not keep speaking on top of what the caller already heard.
func TestAStoppedStreamSaysNoMore(t *testing.T) {
	spoken := []string{}
	stream := newSentenceStream(func(sentence string) { spoken = append(spoken, sentence) })
	stream.push("First one. ")
	stream.stop()
	stream.push("Second one. ")
	stream.flush()

	require.Equal(t, []string{"First one."}, spoken)
}

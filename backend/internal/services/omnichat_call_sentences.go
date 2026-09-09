package services

import (
	"strings"
	"unicode"
)

// A caller waits for the first sentence, not for the whole reply.
//
// A call turn used to generate the reply whole, validate it whole, and
// synthesise it whole before a single word was spoken. Measured on a real call
// that was 5.8 seconds of silence after the caller stopped talking, and none of
// it was needed: nothing about a phone call requires the last sentence to exist
// before the first one is said.
//
// This cuts a token stream into sentences as they finish, so each one is
// synthesised while the next is still being written.

// Nothing is held forever. One long clause with no terminator in it is still
// spoken, rather than waiting for a full stop that never comes.
const maxSpokenSentenceRunes = 320

// abbreviations are the words that end in a full stop without ending a
// sentence.
//
// This list is why there is no minimum sentence length. A minimum was tried
// first and it hid this problem rather than solving it: at twelve runes "I
// went to see Mr. Yang" split into "I went to see Mr." and "Yang about the
// roof", because the guard was measuring the buffer instead of looking at the
// word. It also glued every short opener -- "Hey.", "I know.", "Really?" --
// onto the sentence after it, which is the commonest way a reply on a phone
// call begins, and made her wait for the second sentence before saying the
// first.
var abbreviations = map[string]bool{
	"mr": true, "mrs": true, "ms": true, "dr": true, "prof": true, "st": true,
	"sr": true, "jr": true, "vs": true, "etc": true, "eg": true, "ie": true,
	"approx": true, "dept": true, "co": true, "inc": true, "ltd": true,
}

// "no" is deliberately absent, and this line is why.
//
// It belongs on the list as the abbreviation for "number", and putting it
// there cost far more than it bought: "No." is one of the commonest complete
// sentences anybody says on a telephone, and while it was listed she could
// never say it on its own -- it was glued to whatever followed, so her answer
// waited for the sentence after it. "No. 5" in speech is rare enough to lose.

// sentenceStream turns a token stream into finished sentences.
//
// It is not safe for concurrent use, and it does not need to be: the provider
// delivers one chunk at a time on one goroutine.
type sentenceStream struct {
	pending []rune
	emit    func(sentence string)
	// Speech cannot be unsaid. Once a turn is abandoned, later tokens are
	// dropped rather than spoken on top of what the caller already heard.
	stopped bool
}

func newSentenceStream(emit func(sentence string)) *sentenceStream {
	return &sentenceStream{emit: emit}
}

// push adds the next chunk and speaks any sentence it completed.
func (s *sentenceStream) push(token string) {
	if s == nil || s.stopped || token == "" {
		return
	}
	for _, r := range token {
		s.pending = append(s.pending, r)
		if s.complete() {
			s.flush()
			continue
		}
		if len(s.pending) >= maxSpokenSentenceRunes {
			s.breakAtWord()
		}
	}
}

// breakAtWord gives up on finding a terminator and speaks what is held.
//
// It ends on a whole word. Cutting at the rune that happens to be number 320
// split "extraordinary" into "ext" and "raordinary", and a synthesiser handed
// "raordinary" says it.
func (s *sentenceStream) breakAtWord() {
	if narrationIsOpen(s.pending) {
		// Still inside a stage direction. Waiting is bounded by the end of the
		// reply, and speaking half a stage direction is worse than waiting.
		return
	}
	cut := len(s.pending)
	for i := len(s.pending) - 1; i > 0; i-- {
		if unicode.IsSpace(s.pending[i]) {
			cut = i
			break
		}
	}
	remainder := append([]rune(nil), s.pending[cut:]...)
	s.pending = s.pending[:cut]
	s.flush()
	s.pending = append(s.pending, remainder...)
}

// narrationIsOpen reports whether a stage direction has been started and not
// finished. The closing asterisk is what tells SpokenText where the narration
// ends, and without it the words inside are spoken aloud in her own voice.
func narrationIsOpen(pending []rune) bool {
	asterisks := 0
	for _, r := range pending {
		if r == '*' {
			asterisks++
		}
	}
	return asterisks%2 == 1
}

// flush speaks whatever is held, finished or not. Called when the stream ends.
func (s *sentenceStream) flush() {
	if s == nil || s.stopped {
		return
	}
	sentence := SpokenText(string(s.pending))
	s.pending = s.pending[:0]
	// A run of pure narration leaves nothing to say. Silence is the honest
	// answer; synthesising the asterisks is not.
	if sentence == "" {
		return
	}
	s.emit(sentence)
}

// stop abandons the turn. Nothing more is spoken.
func (s *sentenceStream) stop() {
	if s == nil {
		return
	}
	s.stopped = true
	s.pending = s.pending[:0]
}

// complete reports whether what is held ends a sentence.
func (s *sentenceStream) complete() bool {
	if len(s.pending) == 0 || narrationIsOpen(s.pending) {
		return false
	}
	last := s.pending[len(s.pending)-1]
	if last == '\n' {
		return true
	}
	// A terminator ends a sentence only once the next character has arrived and
	// is a space. That is what keeps "3.5 degrees" one number rather than two
	// sentences: the full stop is followed by a digit, not by a space.
	if !unicode.IsSpace(last) {
		return false
	}
	end := -1
	for i := len(s.pending) - 2; i >= 0; i-- {
		r := s.pending[i]
		if unicode.IsSpace(r) {
			return false
		}
		// Quotes and brackets close after the terminator: `"Stop." ` ends here.
		if r == '"' || r == '\'' || r == ')' || r == ']' || r == '*' {
			continue
		}
		end = i
		break
	}
	if end < 0 {
		return false
	}
	switch s.pending[end] {
	case '?', '!', '…':
		return true
	case '.':
		return !endsWithAbbreviation(s.pending[:end])
	}
	return false
}

// endsWithAbbreviation reports whether the word before a full stop is one that
// does not end a sentence.
//
// A single letter counts, because that is an initial: "written by J. R.
// Tolkien" was read out as "written by J." followed by "R. Tolkien I think".
func endsWithAbbreviation(before []rune) bool {
	start := len(before)
	for start > 0 && !unicode.IsSpace(before[start-1]) {
		start--
	}
	word := strings.ToLower(strings.Trim(string(before[start:]), "\"'([*"))
	if word == "" {
		return false
	}
	if len([]rune(word)) == 1 && unicode.IsLetter([]rune(word)[0]) {
		return true
	}
	return abbreviations[word]
}

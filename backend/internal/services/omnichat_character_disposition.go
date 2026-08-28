package services

import (
	"context"
	"math"
	"strings"
	"time"

	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/models"
)

// A trait has to have moved before it is worth saying anything about. Below
// this the character is at rest, and a prompt that describes rest is a prompt
// that invites the model to perform it -- so a fresh character produces no
// block at all and behaves exactly as it did before traits existed.
const omniChatDispositionDeadband = 0.2

// Above this the wording is strong. It is still not operatic: one bad
// conversation leaves a character low, not destroyed, and language that
// overshoots the state is what turns a disposition into a caricature.
const omniChatDispositionStrong = 0.6

// omniChatTraitLoader reads a character's authored baseline and both tiers of
// her traits at once. The concrete implementation is the repository; the
// interface is here so a conversation can be built without a database.
type omniChatTraitLoader interface {
	LoadForConversation(ctx context.Context, personaID, userID int) (baseline models.OmniChatDispositionBaseline, self, relationship models.OmniChatCharacterTraits, err error)
}

// SetCharacterTraits wires the dispositions a character speaks from. Without
// it the service behaves exactly as it did before they existed.
func (s *ChatbotService) SetCharacterTraits(loader omniChatTraitLoader) *ChatbotService {
	s.traits = loader
	return s
}

// loadDisposition composes how the character is now: who she was written as,
// plus her own state, plus her history with this particular person.
//
// Traits colour a reply and are never a precondition for one, so a repository
// that is missing or failing yields the neutral disposition -- which renders
// nothing -- rather than an error. This is how recall degrades, for the same
// reason.
// loadedDisposition carries the composed disposition the prompt reads and the
// two parts the blocking decision needs. They come from one read because this
// sits in front of the model call, and a second round trip for a second row of
// the same table is time the person waits for nothing.
type loadedDisposition struct {
	Composed models.OmniChatDisposition
	Baseline models.OmniChatDispositionBaseline
	// What this person in particular has done to her, which is what decides
	// whether she is still willing to talk to them.
	Relationship models.OmniChatCharacterTraits
}

func (s *ChatbotService) loadDisposition(ctx context.Context, persona *models.BotPersona, userID int) loadedDisposition {
	if s == nil || s.traits == nil || persona == nil {
		return loadedDisposition{}
	}
	// Both tiers in one read, keyed on the conversation's own user. That key is
	// what keeps one person's history with the character out of everybody
	// else's prompt; the single read is because this sits in front of the model
	// call and a second round trip for a second row of the same table is time
	// the person waits for nothing.
	baseline, self, relationship, err := s.traits.LoadForConversation(ctx, persona.ID, userID)
	if err != nil {
		zlog.Warn().Err(err).Int("persona_id", persona.ID).
			Msg("omnichat traits: unavailable, generating without disposition")
		return loadedDisposition{}
	}
	return loadedDisposition{
		Composed:     models.ComposeOmniChatDisposition(baseline, self, relationship, time.Now()),
		Baseline:     baseline,
		Relationship: relationship,
	}
}

// renderCharacterDisposition writes the disposition as a note about how the
// character is, in language rather than numbers.
//
// The framing is the point. A stat block tells a model to act out a value; a
// note about how someone is lets it colour what they say. So this is presented
// the way recalled memories are -- as the character's own state, explicitly not
// an instruction -- and a character told it is guarded should sound guarded
// rather than announce that it is.
//
// Nothing moves until a trait has left the deadband, so the block is absent far
// more often than it is present, and that is the intended ratio.
func renderCharacterDisposition(disposition models.OmniChatDisposition) string {
	mood := moodPhrase(disposition.Mood)
	toward := make([]string, 0, 2)
	if phrase := trustPhrase(disposition.Trust); phrase != "" {
		toward = append(toward, phrase)
	}
	if phrase := warmthPhrase(disposition.Warmth); phrase != "" {
		toward = append(toward, phrase)
	}
	firmness := firmnessPhrase(disposition.Firmness)
	// How she speaks, which is about her and this person both -- so it sits with
	// firmness, on its own lines, rather than inside "with this person you are".
	speech := make([]string, 0, 2)
	if phrase := talkativenessPhrase(disposition.Talkativeness); phrase != "" {
		speech = append(speech, phrase)
	}
	if phrase := expressivenessPhrase(disposition.Expressiveness); phrase != "" {
		speech = append(speech, phrase)
	}
	if mood == "" && firmness == "" && len(toward) == 0 && len(speech) == 0 {
		return ""
	}

	var builder strings.Builder
	builder.WriteString("\n\n[How You Are Right Now]\n")
	builder.WriteString("This is your own state, not an instruction. Let it colour how you speak; ")
	builder.WriteString("do not announce it, perform it, or mention this note.\n")
	if mood != "" {
		builder.WriteString("You are " + mood + " at the moment.\n")
	}
	if len(toward) > 0 {
		builder.WriteString("With this person you are " + joinClauses(toward) + ".\n")
	}
	// Written as a separate line because it is about her rather than about them.
	// Folding it into "with this person you are..." would read as something this
	// relationship produced, when it is the one part of her that does not move.
	if firmness != "" {
		builder.WriteString(firmness + "\n")
	}
	for _, phrase := range speech {
		builder.WriteString(phrase + "\n")
	}
	return strings.TrimRight(builder.String(), "\n")
}

// talkativenessPhrase says how much of the space she takes up.
//
// About the behaviour, like the others. "You are quiet" invites a character to
// announce that she is quiet, which is the opposite of being it -- what has to
// show up in the reply is the length of the reply.
//
// This moves with the relationship, so the same character produces a different
// line here for a stranger and for somebody she has known for a year. That is
// the point of it: quiet is a fact about her and whoever she is talking to,
// never about her alone.
func talkativenessPhrase(value float64) string {
	switch band(value) {
	case bandStrongPositive:
		return "You talk. You send several messages where one would do, and you finish the thought out loud."
	case bandMildPositive:
		return "You are easy to get talking, and you tend to give more than you were asked for."
	case bandMildNegative:
		return "You do not use more words than you need."
	case bandStrongNegative:
		return "You say very little. A few words is usually the whole of it, and you are comfortable leaving it there."
	}
	return ""
}

// expressivenessPhrase says how much of her is in what she writes.
//
// Deliberately not warmth. Somebody can be enormously fond of a person and
// still undemonstrative about it, and a character written as reserved who came
// out cold would be the wrong character.
func expressivenessPhrase(value float64) string {
	switch band(value) {
	case bandStrongPositive:
		return "What you feel is plain in how you write. You do not hide much and you do not try to."
	case bandMildPositive:
		return "Some of what you feel comes through in how you put things."
	case bandMildNegative:
		return "You keep your tone level. What you feel is there, but it is not on the surface."
	case bandStrongNegative:
		return "Almost nothing of what you feel reaches the page. You can write at length and give away none of it -- this is not coldness, and you are not hiding."
	}
	return ""
}

// firmnessPhrase says what happens when somebody keeps pushing after a no.
//
// Deliberately about the behaviour rather than the label. "You are firm" invites
// a character to announce that she is firm; "a no from you is the end of it"
// describes what she does, which is the thing that has to show up in the reply.
// describeDispositionForJudgement is the same state written for a reader who is
// judging what happened rather than for the character living it.
//
// The two must not share a renderer. renderCharacterDisposition is addressed to
// her, in the second person, under a header that tells her not to announce or
// perform it -- an instruction that is meaningless to an extractor and, worse,
// points it away from the disposition at exactly the moment it is supposed to be
// scoring through it.
func describeDispositionForJudgement(disposition models.OmniChatDisposition) string {
	var parts []string
	if phrase := moodPhrase(disposition.Mood); phrase != "" {
		parts = append(parts, "She is "+phrase+".")
	}

	var toward []string
	if phrase := trustPhrase(disposition.Trust); phrase != "" {
		toward = append(toward, phrase)
	}
	if phrase := warmthPhrase(disposition.Warmth); phrase != "" {
		toward = append(toward, phrase)
	}
	if len(toward) > 0 {
		parts = append(parts, "With this person she is "+joinClauses(toward)+".")
	}

	if phrase := firmnessDescription(disposition.Firmness); phrase != "" {
		parts = append(parts, phrase)
	}
	if phrase := speechDescription(disposition); phrase != "" {
		parts = append(parts, phrase)
	}
	return strings.Join(parts, " ")
}

// speechDescription is how she talks, told about her rather than to her.
//
// A reader judging what happened needs it for the same reason the character
// needs it: a two-word reply from somebody who says very little is an ordinary
// message, and the same reply from somebody who normally fills the page is a
// person who has gone quiet on you. Without this the extractor reads the second
// as the first and records nothing having happened.
func speechDescription(disposition models.OmniChatDisposition) string {
	var said []string
	switch band(disposition.Talkativeness) {
	case bandStrongPositive:
		said = append(said, "talks a great deal")
	case bandMildPositive:
		said = append(said, "talks readily")
	case bandMildNegative:
		said = append(said, "is economical with words")
	case bandStrongNegative:
		said = append(said, "says very little")
	}
	switch band(disposition.Expressiveness) {
	case bandStrongPositive:
		said = append(said, "shows what she feels plainly")
	case bandMildPositive:
		said = append(said, "lets some of what she feels through")
	case bandMildNegative:
		said = append(said, "keeps her tone level")
	case bandStrongNegative:
		said = append(said, "gives almost nothing of what she feels away")
	}
	if len(said) == 0 {
		return ""
	}
	return "She " + joinClauses(said) + "."
}

// firmnessDescription is firmnessPhrase told about her rather than to her.
func firmnessDescription(value float64) string {
	switch band(value) {
	case bandStrongPositive:
		return "When she has said no, that is the end of it: pressure does not move her, and being fond of someone does not make her owe them a yes."
	case bandMildPositive:
		return "She does not give in easily once she has said no."
	case bandMildNegative:
		return "She finds it hard to hold a no when someone keeps pushing, and tends to give a little to keep the peace."
	case bandStrongNegative:
		return "She folds when someone pushes, agrees to things she did not want, and it sits badly with her afterwards."
	}
	return ""
}

func firmnessPhrase(value float64) string {
	switch band(value) {
	case bandStrongPositive:
		return "When you have said no, that is the end of it. Pressure does not move you, and being fond of someone does not make you owe them a yes."
	case bandMildPositive:
		return "You do not give in easily once you have said no, though you would rather not make a scene about it."
	case bandMildNegative:
		return "You find it hard to hold a no when someone keeps pushing, and you tend to give a little to keep the peace."
	case bandStrongNegative:
		return "You fold when someone pushes. You agree to things you did not want, and it sits badly with you afterwards."
	}
	return ""
}

func moodPhrase(value float64) string {
	switch band(value) {
	case bandStrongPositive:
		return "in high spirits"
	case bandMildPositive:
		return "in good spirits"
	case bandMildNegative:
		return "a little flat"
	case bandStrongNegative:
		return "low"
	}
	return ""
}

func trustPhrase(value float64) string {
	switch band(value) {
	case bandStrongPositive:
		return "at ease with them and inclined to take them at their word"
	case bandMildPositive:
		return "fairly at ease"
	case bandMildNegative:
		return "a little guarded"
	case bandStrongNegative:
		return "guarded and slow to take them at their word"
	}
	return ""
}

func warmthPhrase(value float64) string {
	switch band(value) {
	case bandStrongPositive:
		return "very fond of them"
	case bandMildPositive:
		return "fond of them"
	case bandMildNegative:
		return "a little cool toward them"
	case bandStrongNegative:
		return "cool toward them"
	}
	return ""
}

type traitBand int

const (
	bandRest traitBand = iota
	bandMildPositive
	bandStrongPositive
	bandMildNegative
	bandStrongNegative
)

func band(value float64) traitBand {
	magnitude := math.Abs(value)
	if magnitude < omniChatDispositionDeadband {
		return bandRest
	}
	if value > 0 {
		if magnitude >= omniChatDispositionStrong {
			return bandStrongPositive
		}
		return bandMildPositive
	}
	if magnitude >= omniChatDispositionStrong {
		return bandStrongNegative
	}
	return bandMildNegative
}

func joinClauses(clauses []string) string {
	if len(clauses) == 1 {
		return clauses[0]
	}
	return strings.Join(clauses[:len(clauses)-1], ", ") + ", and " + clauses[len(clauses)-1]
}

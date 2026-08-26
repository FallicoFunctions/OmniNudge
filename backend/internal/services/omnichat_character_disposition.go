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
	if mood == "" && firmness == "" && len(toward) == 0 {
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
	return strings.TrimRight(builder.String(), "\n")
}

// firmnessPhrase says what happens when somebody keeps pushing after a no.
//
// Deliberately about the behaviour rather than the label. "You are firm" invites
// a character to announce that she is firm; "a no from you is the end of it"
// describes what she does, which is the thing that has to show up in the reply.
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

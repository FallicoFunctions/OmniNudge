package services

import (
	"strings"

	"github.com/omninudge/backend/internal/models"
)

// Turning the creation answers into a character (§34).
//
// §13 is the whole reason this file exists. A roleplay character *is* her
// fields, so a form can write her directly. An IAI has no instruction channels
// at all, so what the form collects has to become something that moves: a
// starting disposition and some seed memories. "She will never leave him" then
// has nowhere to land, because there is no field to put it in and warmth is a
// number.
//
// The two screens land in different places, and the schema already knew that.
// A baseline is who she was written to be. Traits are what has happened to her,
// per person. So temperament is a baseline -- persona-global, true of her with
// everyone -- and how she feels about her creator is relationship traits, which
// is what makes §34's promise true: anyone else who meets her starts from
// nothing.
//
// **No seed memories.** An earlier version of this produced them, and §35
// explains why that was wrong: she has no past, her memory table is her lived
// experience and nothing else, and an invented episode sits in it scored by the
// same salience as a real one. What a creator wants from "years together" is a
// disposition, and that is available honestly.

// iaiTemperament is one of the answers on §34's fifth screen, and what it means
// in the four dimensions a disposition has.
//
// A table rather than a switch: adding a temperament is a row, and the numbers
// are visible beside each other where they can be compared and argued with.
type iaiTemperament struct {
	Key      string
	Mood     float64
	Trust    float64
	Warmth   float64
	Firmness float64
}

// The list from §34, and deliberately not submissive, dominant, innocent or
// temptress: each of those describes how somebody behaves toward *you*, and a
// starting temperament defined by the reader's role in it is a hardcode wearing
// a nicer word.
var iaiTemperaments = []iaiTemperament{
	{Key: "warm", Mood: 0.25, Trust: 0.30, Warmth: 0.50, Firmness: -0.10},
	{Key: "guarded", Mood: 0.00, Trust: -0.45, Warmth: -0.20, Firmness: 0.35},
	{Key: "blunt", Mood: 0.00, Trust: 0.10, Warmth: 0.00, Firmness: 0.45},
	{Key: "playful", Mood: 0.40, Trust: 0.10, Warmth: 0.30, Firmness: -0.20},
	{Key: "dry", Mood: -0.05, Trust: 0.00, Warmth: -0.10, Firmness: 0.20},
	{Key: "earnest", Mood: 0.15, Trust: 0.35, Warmth: 0.35, Firmness: -0.25},
	{Key: "restless", Mood: 0.15, Trust: 0.00, Warmth: 0.10, Firmness: -0.15},
	{Key: "steady", Mood: 0.10, Trust: 0.15, Warmth: 0.05, Firmness: 0.50},
	{Key: "sharp", Mood: -0.10, Trust: 0.00, Warmth: -0.10, Firmness: 0.45},
	{Key: "quiet", Mood: -0.10, Trust: -0.15, Warmth: -0.20, Firmness: 0.15},
}

// IAITemperamentKeys lists what the form may offer, in the order §34 gives.
func IAITemperamentKeys() []string {
	keys := make([]string, 0, len(iaiTemperaments))
	for _, temperament := range iaiTemperaments {
		keys = append(keys, temperament.Key)
	}
	return keys
}

// omniChatIAITemperamentPicks is how many of them she starts with. Three reads
// as a person; one is a caricature and five is a character sheet.
const omniChatIAITemperamentPicks = 3

// iaiFeeling is one of the answers on §34's seventh screen: how she is with the
// person who made her, on the day they meet.
//
// Named for a feeling rather than a history on purpose. "Together for years"
// asserts a past that does not exist; "besotted" asserts how she is, which is
// both true and the thing a creator actually wanted.
type iaiFeeling struct {
	Key    string
	Warmth float64
	Trust  float64
}

var iaiFeelings = []iaiFeeling{
	{Key: "indifferent", Warmth: 0.00, Trust: 0.00},
	{Key: "curious", Warmth: 0.15, Trust: 0.10},
	{Key: "fond", Warmth: 0.45, Trust: 0.35},
	{Key: "close", Warmth: 0.65, Trust: 0.60},
	{Key: "devoted", Warmth: 0.80, Trust: 0.70},
	{Key: "besotted", Warmth: 0.95, Trust: 0.85},
}

// IAIFeelingKeys lists what the form may offer, in the order §34 gives.
func IAIFeelingKeys() []string {
	keys := make([]string, 0, len(iaiFeelings))
	for _, feeling := range iaiFeelings {
		keys = append(keys, feeling.Key)
	}
	return keys
}

// IAISeed is everything the answers turn into. Nothing here is prompt text.
type IAISeed struct {
	// Baseline is who she is, and it is true of her with everybody.
	//
	// Its Derived flag is not meaningful here and is always false. That flag
	// answers "has her card been read yet", and an IAI has no card -- the form
	// is the derivation. It becomes true when the columns are written, which is
	// the database's answer to give rather than this function's.
	Baseline models.OmniChatDispositionBaseline
	// Relationship is where she starts with the person who made her, and with
	// nobody else.
	Relationship models.OmniChatCharacterTraits
}

// SeedIAI converts the creation answers.
//
// Unknown answers are ignored rather than rejected. A form that gains an option
// before this table does should produce a slightly plainer character, not a
// failed creation, and dropping her on the floor over an unrecognised string
// would be the worst possible trade.
func SeedIAI(temperaments []string, feeling string) IAISeed {
	seed := IAISeed{Baseline: averageTemperaments(temperaments)}
	if chosen, found := findIAIFeeling(feeling); found {
		seed.Relationship = models.OmniChatCharacterTraits{
			Warmth: chosen.Warmth,
			Trust:  chosen.Trust,
		}
	}
	return seed
}

// averageTemperaments blends the picks rather than adding them.
//
// Adding would let three warm answers put her past the top of the scale and
// clamp there, so every warm character would arrive identical. An average keeps
// the picks distinguishable, which is the entire point of picking three.
func averageTemperaments(picks []string) models.OmniChatDispositionBaseline {
	var baseline models.OmniChatDispositionBaseline
	counted := 0
	seen := make(map[string]struct{}, len(picks))

	for _, pick := range picks {
		if counted >= omniChatIAITemperamentPicks {
			// §34 asks for three. A caller sending more is a form out of step
			// with this table, and quietly averaging six of them would produce
			// a character nobody chose.
			break
		}
		key := strings.TrimSpace(strings.ToLower(pick))
		if _, repeated := seen[key]; repeated {
			// Picking "warm" three times is one answer said three times, not a
			// character three times as warm.
			continue
		}
		temperament, found := findIAITemperament(key)
		if !found {
			continue
		}
		seen[key] = struct{}{}
		baseline.Mood += temperament.Mood
		baseline.Trust += temperament.Trust
		baseline.Warmth += temperament.Warmth
		baseline.Firmness += temperament.Firmness
		counted++
	}
	if counted == 0 {
		return models.OmniChatDispositionBaseline{}
	}
	// No clamping. An average of values inside -1..1 cannot leave that range, so
	// a clamp here could only ever fire on a mistyped table row -- and it would
	// fire *silently*, turning a 5.0 somebody fat-fingered into a 1.0 and
	// shipping a character subtly unlike the one they configured.
	//
	// The row values are asserted directly in the tests, and
	// SetOmniChatDispositionBaseline refuses an out-of-range value with a
	// message naming the persona. Both of those are loud. A quiet clamp between
	// them would hide exactly what they exist to reveal.
	divisor := float64(counted)
	baseline.Mood /= divisor
	baseline.Trust /= divisor
	baseline.Warmth /= divisor
	baseline.Firmness /= divisor
	return baseline
}

func findIAITemperament(key string) (iaiTemperament, bool) {
	for _, temperament := range iaiTemperaments {
		if temperament.Key == key {
			return temperament, true
		}
	}
	return iaiTemperament{}, false
}

func findIAIFeeling(key string) (iaiFeeling, bool) {
	key = strings.TrimSpace(strings.ToLower(key))
	for _, feeling := range iaiFeelings {
		if feeling.Key == key {
			return feeling, true
		}
	}
	return iaiFeeling{}, false
}

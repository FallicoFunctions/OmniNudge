package services

import (
	"math"
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
	// How much she says, and how much feeling is in what she says. Both are
	// where she starts with a stranger; how far closeness opens her is worked
	// out from the rest of her, not stored here.
	Talkativeness  float64
	Expressiveness float64
}

// The list from §34, and deliberately not submissive, dominant, innocent or
// temptress: each of those describes how somebody behaves toward *you*, and a
// starting temperament defined by the reader's role in it is a hardcode wearing
// a nicer word.
var iaiTemperaments = []iaiTemperament{
	// Paired, so the form reads as choices rather than a list. Each row sits
	// beside the trait it pulls against -- warm and guarded, playful and
	// serious, blunt and tactful -- and nothing stops somebody picking both.
	// Warm and guarded together is not a contradiction: it describes an open,
	// friendly person who tells you nothing about themselves.
	{Key: "warm", Mood: 0.25, Trust: 0.30, Warmth: 0.50, Firmness: -0.10, Talkativeness: 0.20, Expressiveness: 0.40},
	{Key: "guarded", Mood: 0.00, Trust: -0.45, Warmth: -0.20, Firmness: 0.35, Talkativeness: -0.30, Expressiveness: -0.30},

	{Key: "outgoing", Mood: 0.30, Trust: 0.20, Warmth: 0.40, Firmness: -0.05, Talkativeness: 0.50, Expressiveness: 0.35},
	// Nothing on the first four axes. Quiet was carrying a warmth and a trust
	// penalty because there was nowhere else to put it, which made a quiet
	// character cold and suspicious instead of quiet. It has a home now, and
	// quiet is not shyness: what she says when she says something can be as open
	// as anybody's.
	{Key: "quiet", Mood: 0.00, Trust: 0.00, Warmth: 0.00, Firmness: 0.00, Talkativeness: -0.60, Expressiveness: -0.10},

	{Key: "playful", Mood: 0.40, Trust: 0.10, Warmth: 0.30, Firmness: -0.20, Talkativeness: 0.30, Expressiveness: 0.45},
	{Key: "serious", Mood: -0.10, Trust: 0.05, Warmth: -0.10, Firmness: 0.40, Talkativeness: -0.10, Expressiveness: -0.30},

	{Key: "blunt", Mood: 0.00, Trust: 0.10, Warmth: 0.00, Firmness: 0.45, Talkativeness: -0.20, Expressiveness: 0.10},
	{Key: "tactful", Mood: 0.05, Trust: 0.20, Warmth: 0.25, Firmness: -0.30, Talkativeness: 0.15, Expressiveness: -0.10},

	{Key: "dry", Mood: -0.05, Trust: 0.00, Warmth: -0.10, Firmness: 0.20, Talkativeness: -0.20, Expressiveness: -0.40},
	{Key: "earnest", Mood: 0.15, Trust: 0.35, Warmth: 0.35, Firmness: -0.25, Talkativeness: 0.10, Expressiveness: 0.40},

	{Key: "confident", Mood: 0.15, Trust: 0.15, Warmth: 0.05, Firmness: 0.40, Talkativeness: 0.20, Expressiveness: 0.10},
	// Reserved keeps more back than quiet does. Quiet is about how much
	// somebody says; reserved is about how much of themselves is in it.
	// Reserved is not guarded, and the trust penalty it used to carry was the
	// difference between the two. She can write at length and tell you a great
	// deal; what she does not do is let much feeling into it. The firmness is
	// what "with purpose" means -- measured rather than rambling.
	{Key: "reserved", Mood: 0.00, Trust: 0.00, Warmth: 0.00, Firmness: 0.20, Talkativeness: 0.00, Expressiveness: -0.50},

	{Key: "curious", Mood: 0.20, Trust: 0.15, Warmth: 0.20, Firmness: -0.20, Talkativeness: 0.30, Expressiveness: 0.20},
	{Key: "restless", Mood: 0.15, Trust: 0.00, Warmth: 0.10, Firmness: -0.15, Talkativeness: 0.25, Expressiveness: 0.20},

	{Key: "steady", Mood: 0.10, Trust: 0.15, Warmth: 0.05, Firmness: 0.50, Talkativeness: 0.00, Expressiveness: -0.10},
	{Key: "sensitive", Mood: -0.05, Trust: 0.20, Warmth: 0.35, Firmness: -0.35, Talkativeness: 0.10, Expressiveness: 0.50},

	{Key: "sharp", Mood: -0.10, Trust: 0.00, Warmth: -0.10, Firmness: 0.45, Talkativeness: -0.10, Expressiveness: 0.00},
	{Key: "easygoing", Mood: 0.25, Trust: 0.20, Warmth: 0.25, Firmness: -0.30, Talkativeness: 0.20, Expressiveness: 0.30},
}

// IAITemperamentKeys lists what the form may offer, in the order §34 gives.
func IAITemperamentKeys() []string {
	keys := make([]string, 0, len(iaiTemperaments))
	for _, temperament := range iaiTemperaments {
		keys = append(keys, temperament.Key)
	}
	return keys
}

// omniChatIAITemperamentPicks is the most she starts with, not the number she
// must have.
//
// Three is a ceiling because a character built from six traits is a character
// built from none: everything averages toward the middle and nothing shows. But
// forcing a third pick makes somebody choose noise to get past the screen, and
// that noise becomes baseline personality she then has to carry. One deliberate
// trait beats three where the third was filler.
//
// The averaging below already divides by what it was given, so one and two need
// nothing from this file beyond permission.
const omniChatIAITemperamentPicks = 3

// IAITemperamentPicks is that ceiling, so the form applies the same number
// rather than a copy of it.
func IAITemperamentPicks() int { return omniChatIAITemperamentPicks }

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

	// Attachment as well, because "devoted" is a word about what this person's
	// absence would cost her. Setting warmth and trust alone produced a
	// character whose creator chose devoted and who was attached to nobody.
	Attachment float64
}

// Six states rather than one ladder from stranger to love.
//
// The old list ran indifferent to besotted and mixed two questions together.
// "Besotted" is a word about attraction sitting on a scale about trust, which
// is exactly why attraction is its own answer now -- somebody can be
// immediately taken with a person they do not trust, and the ladder could not
// say it.
//
// "Neutral" rather than "indifferent". Indifferent says she does not care,
// which is a judgement about somebody she has not met. Neutral is the honest
// zero: her opinion has not been formed yet.
var iaiFeelings = []iaiFeeling{
	{Key: "guarded", Warmth: -0.15, Trust: -0.40, Attachment: 0.00},
	{Key: "neutral", Warmth: 0.00, Trust: 0.00, Attachment: 0.00},
	{Key: "curious", Warmth: 0.15, Trust: 0.10, Attachment: 0.05},
	{Key: "fond", Warmth: 0.45, Trust: 0.35, Attachment: 0.20},
	{Key: "close", Warmth: 0.65, Trust: 0.60, Attachment: 0.50},
	{Key: "devoted", Warmth: 0.80, Trust: 0.70, Attachment: 0.85},
}

// iaiAttractionLevel is the second answer on the same screen.
//
// Three, not a slider. It is the one answer where a scale invites somebody to
// aim for the top, and the difference between "somewhat" and "very" is the only
// distinction that changes anything she says.
//
// No negative level. Trust goes negative into wariness and warmth into dislike,
// both ordinary; the other end of this one is repulsion, which the column
// refuses and the product does not model.
type iaiAttractionLevel struct {
	Key   string
	Value float64
}

var iaiAttractionLevels = []iaiAttractionLevel{
	{Key: "none", Value: 0.00},
	{Key: "some", Value: 0.35},
	{Key: "strong", Value: 0.75},
}

// IAIAttractionKeys lists what the form may offer, in the order §34 gives.
func IAIAttractionKeys() []string {
	keys := make([]string, 0, len(iaiAttractionLevels))
	for _, level := range iaiAttractionLevels {
		keys = append(keys, level.Key)
	}
	return keys
}

func findIAIAttraction(key string) (iaiAttractionLevel, bool) {
	key = strings.TrimSpace(strings.ToLower(key))
	for _, level := range iaiAttractionLevels {
		if level.Key == key {
			return level, true
		}
	}
	return iaiAttractionLevel{}, false
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
func SeedIAI(temperaments []string, feeling, attraction string) IAISeed {
	seed := IAISeed{Baseline: blendTemperaments(temperaments)}
	if chosen, found := findIAIFeeling(feeling); found {
		seed.Relationship = models.OmniChatCharacterTraits{
			Warmth:     chosen.Warmth,
			Trust:      chosen.Trust,
			Attachment: chosen.Attachment,
		}
	}
	// Set independently of the feeling, which is the whole reason it is a
	// separate answer. Guarded and drawn to them is a real starting point, and
	// close without any of it is another.
	if level, found := findIAIAttraction(attraction); found {
		seed.Relationship.Attraction = level.Value
	}
	return seed
}

// averageTemperaments blends the picks rather than adding them.
//
// Adding would let three warm answers put her past the top of the scale and
// clamp there, so every warm character would arrive identical. An average keeps
// the picks distinguishable, which is the entire point of picking three.
func blendTemperaments(picks []string) models.OmniChatDispositionBaseline {
	var baseline models.OmniChatDispositionBaseline
	counted := 0
	seen := make(map[string]struct{}, len(picks))

	for _, pick := range picks {
		if counted >= omniChatIAITemperamentPicks {
			// §34 allows up to three. A caller sending more is a form out of
			// step with this table, and quietly averaging six of them would
			// produce a character nobody chose.
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
		baseline.Talkativeness += temperament.Talkativeness
		baseline.Expressiveness += temperament.Expressiveness
		counted++
	}
	if counted == 0 {
		return models.OmniChatDispositionBaseline{}
	}
	// Divided by the square root of the count, not the count.
	//
	// Averaging was measured and it does not work. It divides every pick by
	// three, and a third of a small number falls under the threshold where the
	// prompt says anything at all -- so across all 816 possible three-trait
	// combinations, 54% of them produced a character who says nothing about
	// herself. The screen that promises to set who she is did nothing, more
	// often than it did something.
	//
	// The square root keeps what averaging got right and drops what it got
	// wrong. Traits that agree reinforce each other; traits that pull against
	// each other still cancel, so warm plus guarded plus quiet correctly leaves
	// her warmth unremarkable. Silence falls from 54% to 10%.
	//
	// Adding them outright was the other candidate and is worse: it is almost
	// never silent, but a tenth of combinations hit the top of the scale, and
	// two different characters pinned at the top are the same character on that
	// axis. That is the fault averaging was written to avoid, and it is real.
	//
	// No clamping, for the reason clamping was refused before: it would fire
	// silently on a mistyped row and ship a character subtly unlike the one
	// somebody configured. What guarantees the range now is the table itself,
	// asserted by a test that blends every combination and checks the bounds.
	divisor := math.Sqrt(float64(counted))
	baseline.Mood /= divisor
	baseline.Trust /= divisor
	baseline.Warmth /= divisor
	baseline.Firmness /= divisor
	baseline.Talkativeness /= divisor
	baseline.Expressiveness /= divisor
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

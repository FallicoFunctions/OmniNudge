package services

import (
	"errors"
	"strings"
)

// What she looks like (§34, screens 1 to 4).
//
// Recorded now and drawn later. Nothing can turn this into a likeness yet, but
// creation is the only moment somebody is thinking about it, and asking again
// later is worse than asking once.

// IAIAppearance is the answers, as given.
type IAIAppearance struct {
	Style      string `json:"style,omitempty"`
	Gender     string `json:"gender,omitempty"`
	Age        int    `json:"age,omitempty"`
	Ethnicity  string `json:"ethnicity,omitempty"`
	Hair       string `json:"hair,omitempty"`
	HairColour string `json:"hair_colour,omitempty"`
	Eyes       string `json:"eyes,omitempty"`
	Build      string `json:"build,omitempty"`
}

// The options §34 offers. Tables rather than switches: a new hairstyle is a
// row, and the whole list is visible in one place where the form can be checked
// against it.
var (
	iaiStyles      = []string{"realistic", "anime"}
	iaiGenders     = []string{"woman", "man"}
	iaiEthnicities = []string{"caucasian", "asian", "black", "latina", "arab", "mixed"}
	iaiHair        = []string{"straight", "bangs", "curly", "bun", "short", "ponytail"}
	iaiHairColours = []string{"brunette", "blonde", "black", "red", "dyed"}
	iaiEyes        = []string{"brown", "blue", "green", "grey", "hazel"}
	iaiBuilds      = []string{"slim", "athletic", "average", "curvy", "heavy"}
)

const (
	// omniChatIAIMinimumAge is a hard floor rather than a preference, which is
	// why it refuses instead of correcting. §13 permits a "must" where somebody
	// is kept safe, and this is the clearest case there is.
	//
	// §34's screen is a slider starting here, so nobody can answer below it
	// through the form. The check is not about the form: this endpoint is
	// reachable without it, and a server trusting the client to have used the
	// interface is not enforcing anything.
	omniChatIAIMinimumAge = 18

	// omniChatIAIMaximumAge is the top of §34's slider, and it is a real age
	// rather than a bucket. A "55+" label looked like a range and was not one:
	// every answer above it collapsed to the same number, so two people who
	// asked for different characters got the same one and were never told.
	//
	// 99 costs something honest instead. The likeness generator and the 3D rigs
	// have to cover old age, and until they do an old character reads correctly
	// in text and not yet in a portrait. That is a gap to close, not a reason to
	// refuse the answer.
	omniChatIAIMaximumAge = 99
)

// ErrIAIUnderage refuses a character described as a minor. Unlike every other
// answer here, this one is not quietly dropped: a silently corrected age would
// tell somebody their answer was accepted.
var ErrIAIUnderage = errors.New("omnichat iai: a character under 18 will not be made")

// IAIAgeRange is the slider's ends, so the form draws the range this file
// enforces rather than a copy of it that can quietly disagree.
func IAIAgeRange() (minimum, maximum int) {
	return omniChatIAIMinimumAge, omniChatIAIMaximumAge
}

// IAIAppearanceOptions is what the form may offer, so the interface and this
// table cannot drift apart without a test noticing.
//
// Copies, not the tables themselves. The order is §34's and several tests assert
// it, so one caller sorting the list it was handed -- to render it alphabetically,
// say -- would quietly reorder the canonical list for everybody afterwards. The
// key lists and the plan limits already copy for the same reason.
func IAIAppearanceOptions() map[string][]string {
	options := map[string][]string{
		"style":       iaiStyles,
		"gender":      iaiGenders,
		"ethnicity":   iaiEthnicities,
		"hair":        iaiHair,
		"hair_colour": iaiHairColours,
		"eyes":        iaiEyes,
		"build":       iaiBuilds,
	}
	for field, values := range options {
		options[field] = append([]string(nil), values...)
	}
	return options
}

// normaliseIAIAppearance keeps what it recognises and drops what it does not.
//
// Dropping rather than refusing, for everything except the age. A form that
// gains an option before this table does should cost somebody a detail of how
// she looks, not the character they just spent nine screens on -- and an
// unrecognised value stored anyway would reach the generator as nonsense later.
func normaliseIAIAppearance(appearance IAIAppearance) (IAIAppearance, error) {
	if appearance.Age != 0 && appearance.Age < omniChatIAIMinimumAge {
		return IAIAppearance{}, ErrIAIUnderage
	}
	if appearance.Age > omniChatIAIMaximumAge {
		appearance.Age = omniChatIAIMaximumAge
	}
	appearance.Style = keepKnown(appearance.Style, iaiStyles)
	appearance.Gender = keepKnown(appearance.Gender, iaiGenders)
	appearance.Ethnicity = keepKnown(appearance.Ethnicity, iaiEthnicities)
	appearance.Hair = keepKnown(appearance.Hair, iaiHair)
	appearance.HairColour = keepKnown(appearance.HairColour, iaiHairColours)
	appearance.Eyes = keepKnown(appearance.Eyes, iaiEyes)
	appearance.Build = keepKnown(appearance.Build, iaiBuilds)
	return appearance, nil
}

func keepKnown(value string, known []string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	for _, candidate := range known {
		if candidate == value {
			return value
		}
	}
	return ""
}

// described reports whether anything was actually chosen, so a character nobody
// answered these screens for stores no appearance rather than an empty object
// that looks like an answer.
func (a IAIAppearance) described() bool {
	return a != IAIAppearance{}
}

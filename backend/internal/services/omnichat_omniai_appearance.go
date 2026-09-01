package services

import (
	"errors"
	"strings"
)

// What she looks like (§34, screens 1 to 4).
//
// Recorded now and drawn later. Nothing turns this into a likeness yet -- the
// media path is reference-only for user-owned personas -- but creation is the
// only moment somebody is thinking about it, and asking again later is worse
// than asking once. The detail here is for the generator that does not exist
// yet: "long, wavy, ponytail" is a description, where "ponytail" was a guess.

// OmniAIAppearance is the answers, as given.
type OmniAIAppearance struct {
	Style        string `json:"style,omitempty"`
	Gender       string `json:"gender,omitempty"`
	Age          int    `json:"age,omitempty"`
	HeightInches int    `json:"height_inches,omitempty"`
	Ethnicity    string `json:"ethnicity,omitempty"`
	HairLength   string `json:"hair_length,omitempty"`
	HairTexture  string `json:"hair_texture,omitempty"`
	HairStyle    string `json:"hair_style,omitempty"`
	HairColour   string `json:"hair_colour,omitempty"`
	Eyes         string `json:"eyes,omitempty"`
	Build        string `json:"build,omitempty"`
}

// The options §34 offers. Tables rather than switches: a new hair colour is a
// row, and the whole list is visible in one place where the form can be checked
// against it.
//
// Keys only, never labels. The interface translates them, which is also how
// "latino" shows as Latina or Latino without this file knowing anything about
// how the answer is spoken.
var (
	omniAIStyles = []string{"realistic", "anime"}

	omniAIGenders = []string{"woman", "man"}

	omniAIEthnicities = []string{
		"white", "black", "east_asian", "south_asian", "southeast_asian",
		"latino", "middle_eastern", "pacific_islander", "indigenous", "mixed", "other",
	}

	// Colours rather than people. "Brunette" describes somebody, not the colour
	// of their hair, and "dyed" describes how a colour got there -- which is not
	// what a generator needs and not what anybody was choosing.
	omniAIHairColours = []string{
		"black", "dark_brown", "brown", "light_brown", "blonde", "red", "auburn",
		"strawberry_blonde", "gray", "white",
		"platinum_blonde", "pink", "purple", "blue", "green", "silver",
	}

	// The eye colours people have.
	omniAIEyes = []string{"brown", "dark_brown", "blue", "green", "grey", "hazel", "amber"}

	// The ones they do not. Offered on anime only, where the drawing is already
	// not claiming to be a photograph.
	omniAIAnimeEyes = []string{"violet", "crimson", "gold"}

	// Build is gendered because the silhouettes are. Curvy says something
	// specific about a woman's shape and nothing useful about a man's, and the
	// men's set was missing muscular entirely.
	//
	// Neither set carries petite. That was height wearing a build's clothes, and
	// height is its own answer now -- so short and curvy, or tall and slim, are
	// two answers rather than one compromise.
	omniAIBuildsByGender = map[string][]string{
		"woman": {"slim", "average", "athletic", "curvy", "muscular", "plus_size"},
		"man":   {"slim", "lean", "average", "athletic", "muscular", "stocky", "heavy"},
	}
)

const (
	// omniChatOmniAIMinimumAge is a hard floor rather than a preference, which is
	// why it refuses instead of correcting. §13 permits a "must" where somebody
	// is kept safe, and this is the clearest case there is.
	//
	// §34's screen is a slider starting here, so nobody can answer below it
	// through the form. The check is not about the form: this endpoint is
	// reachable without it, and a server trusting the client to have used the
	// interface is not enforcing anything.
	omniChatOmniAIMinimumAge = 18

	// omniChatOmniAIMaximumAge is the top of §34's slider, and it is a real age
	// rather than a bucket. A "55+" label looked like a range and was not one:
	// every answer above it collapsed to the same number, so two people who
	// asked for different characters got the same one and were never told.
	//
	// 99 costs something honest instead. The likeness generator and the 3D rigs
	// have to cover old age, and until they do an old character reads correctly
	// in text and not yet in a portrait. That is a gap to close, not a reason to
	// refuse the answer.
	omniChatOmniAIMaximumAge = 99

	// Height is inches, because the people using this are American and a slider
	// they cannot read is a slider they cannot answer. Centimetres sit beside it
	// as the second reading.
	//
	// The floor is 4 feet 10 inches. That is the clinical threshold for adult
	// short stature, so it covers short adults and does not offer a height that
	// only a child has. The age floor is the real guard; this one exists so the
	// two answers cannot be combined into an implication neither makes alone.
	omniChatOmniAIMinimumHeightInches = 58

	// Seven feet. Above it is not a person somebody is describing.
	omniChatOmniAIMaximumHeightInches = 84
)

// ErrOmniAIUnderage refuses a character described as a minor. Unlike every other
// answer here, this one is not quietly dropped: a silently corrected age would
// tell somebody their answer was accepted.
var ErrOmniAIUnderage = errors.New("omnichat omniai: a character under 18 will not be made")

// OmniAIAgeRange is the slider's ends, so the form draws the range this file
// enforces rather than a copy of it that can quietly disagree.
func OmniAIAgeRange() (minimum, maximum int) {
	return omniChatOmniAIMinimumAge, omniChatOmniAIMaximumAge
}

// OmniAIHeightRange is the same, in inches.
func OmniAIHeightRange() (minimum, maximum int) {
	return omniChatOmniAIMinimumHeightInches, omniChatOmniAIMaximumHeightInches
}

// OmniAIEyeColours is what this character's eyes may be.
//
// Violet, crimson and gold exist on anime only. On a realistic character they
// would be a claim about a person that is not true of any person.
func OmniAIEyeColours(style string) []string {
	colours := append([]string(nil), omniAIEyes...)
	if strings.TrimSpace(strings.ToLower(style)) == "anime" {
		colours = append(colours, omniAIAnimeEyes...)
	}
	return colours
}

// OmniAIBuilds is the silhouettes offered for this gender. An unrecognised gender
// gets the shared middle rather than nothing, so a form that has not asked yet
// still has something to draw.
func OmniAIBuilds(gender string) []string {
	if builds, listed := omniAIBuildsByGender[strings.TrimSpace(strings.ToLower(gender))]; listed {
		return append([]string(nil), builds...)
	}
	return []string{"slim", "average", "athletic", "muscular"}
}

// OmniAIAppearanceOptions is what the form may offer, so the interface and this
// table cannot drift apart without a test noticing.
//
// Copies, not the tables themselves. The order is §34's and several tests assert
// it, so one caller sorting the list it was handed -- to render it
// alphabetically, say -- would quietly reorder the canonical list for everybody
// afterwards.
//
// The three lists that depend on another answer are not here: eye colour needs
// the style, build needs the gender, and hair style needs all three of gender,
// length and texture. Those have their own functions, and the form asks in an
// order that has the answer before it needs it.
func OmniAIAppearanceOptions() map[string][]string {
	options := map[string][]string{
		"style":        omniAIStyles,
		"gender":       omniAIGenders,
		"ethnicity":    omniAIEthnicities,
		"hair_length":  omniAIHairLengths,
		"hair_texture": omniAIHairTextures,
		"hair_colour":  omniAIHairColours,
	}
	for field, values := range options {
		options[field] = append([]string(nil), values...)
	}
	return options
}

// normaliseOmniAIAppearance keeps what it recognises and drops what it does not.
//
// Dropping rather than refusing, for everything except the age. A form that
// gains an option before this table does should cost somebody a detail of how
// she looks, not the character they just spent nine screens on -- and an
// unrecognised value stored anyway would reach the generator as nonsense later.
//
// The dependent answers are checked against what they depend on, in order. A
// pixie on very long hair, an afro on straight hair, or violet eyes on a
// realistic character are all answers the form cannot produce, which is exactly
// why they are worth checking: anything that arrives here did not come from the
// form.
func normaliseOmniAIAppearance(appearance OmniAIAppearance) (OmniAIAppearance, error) {
	if appearance.Age != 0 && appearance.Age < omniChatOmniAIMinimumAge {
		return OmniAIAppearance{}, ErrOmniAIUnderage
	}
	if appearance.Age > omniChatOmniAIMaximumAge {
		appearance.Age = omniChatOmniAIMaximumAge
	}
	if appearance.HeightInches != 0 {
		if appearance.HeightInches < omniChatOmniAIMinimumHeightInches {
			appearance.HeightInches = omniChatOmniAIMinimumHeightInches
		}
		if appearance.HeightInches > omniChatOmniAIMaximumHeightInches {
			appearance.HeightInches = omniChatOmniAIMaximumHeightInches
		}
	}

	appearance.Style = keepKnown(appearance.Style, omniAIStyles)
	appearance.Gender = keepKnown(appearance.Gender, omniAIGenders)
	appearance.Ethnicity = keepKnown(appearance.Ethnicity, omniAIEthnicities)
	appearance.HairLength = keepKnown(appearance.HairLength, omniAIHairLengths)
	appearance.HairTexture = keepKnown(appearance.HairTexture, omniAIHairTextures)
	appearance.HairColour = keepKnown(appearance.HairColour, omniAIHairColours)

	appearance.Eyes = keepKnown(appearance.Eyes, OmniAIEyeColours(appearance.Style))
	appearance.Build = keepKnown(appearance.Build, OmniAIBuilds(appearance.Gender))
	appearance.HairStyle = keepKnown(appearance.HairStyle,
		OmniAIHairStyles(appearance.Style, appearance.Gender, appearance.HairTexture))

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
func (a OmniAIAppearance) described() bool {
	return a != OmniAIAppearance{}
}

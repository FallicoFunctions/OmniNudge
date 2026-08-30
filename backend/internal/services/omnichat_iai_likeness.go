package services

import (
	"fmt"
	"strings"
)

// Her appearance, said in words.
//
// This is the half of a likeness that needs no model. The image pipeline
// conditions on a reference photo, and the code that resolves it says plainly
// why words are still required: "a single reference photo plus a general
// adapter reproduces identity only weakly, so stating the invariants in words
// is what keeps hair and colouring consistent between generations."
//
// So an IAI gets this the moment she is made, before anything has drawn her.
// Every scene of her is consistent from the first one, and the picture that
// arrives later refines an identity that already exists rather than inventing
// it.
//
// The drawing style is deliberately not in here. Identity survives the medium:
// what she looks like is the same fact whether she is drawn or photographed,
// and the medium belongs to the prompt that renders her, not to her.

// iaiSpokenEthnicity is the ethnicities that do not read as English on their
// own, or that are spoken differently by gender. Anything absent is its key with
// the underscores opened out, which is already correct for most of them.
var iaiSpokenEthnicity = map[string]map[string]string{
	"latino":           {"woman": "Latina", "man": "Latino", "": "Latino"},
	"white":            {"": "white"},
	"east_asian":       {"": "East Asian"},
	"south_asian":      {"": "South Asian"},
	"southeast_asian":  {"": "Southeast Asian"},
	"middle_eastern":   {"": "Middle Eastern"},
	"pacific_islander": {"": "Pacific Islander"},
	"indigenous":       {"": "Indigenous"},
	"mixed":            {"": "mixed-race"},
	"other":            {"": ""},
}

// iaiSpokenBuild says a silhouette the way a person would. "plus_size" opened
// out reads as a clothing label rather than a body.
var iaiSpokenBuild = map[string]string{
	"plus_size": "full-figured",
}

// iaiSpokenHairShape is how each shape is worn, as the words that follow "hair".
//
// "worn in a" for everything produced "a bangs", "a braids", "a locs", "a afro"
// and "a natural". The shapes are not one grammatical kind: some are things
// hair is put into, some are plural, some describe how it sits, and some are
// features it has. One row each is the only honest way to say them.
var iaiSpokenHairShape = map[string]string{
	"natural":       "worn natural",
	"textured":      "worn textured",
	"slicked_back":  "slicked back",
	"half_up":       "worn half up",
	"middle_part":   "in a middle part",
	"side_part":     "in a side part",
	"ponytail":      "in a ponytail",
	"high_ponytail": "in a high ponytail",
	"bun":           "in a bun",
	"messy_bun":     "in a messy bun",
	"man_bun":       "in a man bun",
	"bob":           "in a bob",
	"pixie":         "in a pixie cut",
	"quiff":         "in a quiff",
	"pompadour":     "in a pompadour",
	"crew_cut":      "in a crew cut",
	"afro":          "in an afro",
	"braids":        "in braids",
	"cornrows":      "in cornrows",
	"locs":          "in locs",
	"pigtails":      "in pigtails",
	"curtains":      "in curtains",
}

// iaiHairFeature is the shapes that are not something hair is put into but
// something it has. Given to the hair phrase they produced "short hair with an
// undercut" inside a sentence that already said "with", so they stand as their
// own feature and the list joins them: "short hair, an undercut and brown eyes".
var iaiHairFeature = map[string]string{
	"bangs":         "bangs",
	"curtain_bangs": "curtain bangs",
	"fringe":        "a fringe",
	"undercut":      "an undercut",
	"fade":          "a fade",
}

// iaiHairLengthHasNoTexture is the lengths with nothing left to have a texture.
// "shaved coily hair" is a contradiction, and it is what asking two independent
// questions produces when nobody reconciles the answers.
var iaiHairLengthHasNoTexture = map[string]bool{"shaved": true, "buzzed": true}

// iaiPossessive, for the case where nothing describes the hair but its shape.
// "with hair in a bun" is not how anybody says it.
func iaiPossessive(gender string) string {
	switch strings.TrimSpace(strings.ToLower(gender)) {
	case "woman":
		return "her"
	case "man":
		return "his"
	}
	return "their"
}

// iaiSpokenHairLength keeps the lengths from reading as bare adjectives beside
// the texture and shape they sit with.
var iaiSpokenHairLength = map[string]string{
	"very_short": "very short",
	"shoulder":   "shoulder-length",
	"very_long":  "very long",
}

// RenderIAIAppearance turns the answers into the stable physical description
// the image prompt is given.
//
// Unanswered fields are simply absent. Somebody who skipped the face screens
// gets a shorter sentence rather than a description full of invented detail,
// which is the whole reason those screens may be skipped.
func RenderIAIAppearance(appearance IAIAppearance) string {
	gender := strings.TrimSpace(strings.ToLower(appearance.Gender))

	var subject []string
	if appearance.Age > 0 {
		subject = append(subject, fmt.Sprintf("%d-year-old", appearance.Age))
	}
	if ethnicity := iaiSpokenEthnicityFor(appearance.Ethnicity, gender); ethnicity != "" {
		subject = append(subject, ethnicity)
	}
	switch gender {
	case "woman", "man":
		subject = append(subject, gender)
	default:
		subject = append(subject, "person")
	}

	// Height sits with the subject rather than in the list of features. "A
	// woman with 5'6\" tall" is what putting it in the list produces, and
	// reading the output is the only way that shows.
	// "A 18-year-old woman" -- and 18 is the youngest anybody may be, so the
	// boundary case is the common one.
	who := iaiOpeningArticle(subject[0], appearance.Age) + " " + strings.Join(subject, " ")

	// The comma belongs to the height or not at all. Without it this reads "A
	// woman, with long black hair", which is a pause nobody speaks.
	joiner := " with "
	if appearance.HeightInches > 0 {
		who += fmt.Sprintf(", %d'%d\" tall", appearance.HeightInches/12, appearance.HeightInches%12)
		joiner = ", with "
	}

	var features []string
	if hair := iaiSpokenHair(appearance); hair != "" {
		features = append(features, hair)
	}
	if feature, found := iaiHairFeature[strings.TrimSpace(strings.ToLower(appearance.HairStyle))]; found {
		features = append(features, feature)
	}
	if eyes := iaiOpenOut(appearance.Eyes); eyes != "" {
		features = append(features, eyes+" eyes")
	}
	if build := iaiSpokenBuildFor(appearance.Build); build != "" {
		features = append(features, indefiniteArticle(build)+" "+build+" build")
	}

	if len(features) == 0 {
		return who + "."
	}
	return who + joiner + joinIAIClauses(features) + "."
}

// indefiniteArticle, because "a athletic build" is what not having one reads
// like. Vowel sounds, not vowels: nothing in these tables begins with a silent
// h or a long u, so the letter is enough and pretending otherwise would be
// machinery for a case that does not exist.
// iaiOpeningArticle is the article for the whole sentence. An age leads when
// there is one, and ages are read as numbers rather than as their digits: 18
// and the eighties take "an", and nothing else in 18..99 does.
func iaiOpeningArticle(firstWord string, age int) string {
	if age > 0 {
		if age == 18 || (age >= 80 && age <= 89) {
			return "An"
		}
		return "A"
	}
	if indefiniteArticle(firstWord) == "an" {
		return "An"
	}
	return "A"
}

func indefiniteArticle(word string) string {
	if word == "" {
		return "a"
	}
	if strings.ContainsRune("aeiou", rune(word[0])) {
		return "an"
	}
	return "a"
}

func iaiSpokenEthnicityFor(key, gender string) string {
	key = strings.TrimSpace(strings.ToLower(key))
	if key == "" {
		return ""
	}
	if spoken, found := iaiSpokenEthnicity[key]; found {
		if byGender, ok := spoken[gender]; ok {
			return byGender
		}
		return spoken[""]
	}
	return iaiOpenOut(key)
}

func iaiSpokenBuildFor(key string) string {
	key = strings.TrimSpace(strings.ToLower(key))
	if key == "" {
		return ""
	}
	if spoken, found := iaiSpokenBuild[key]; found {
		return spoken
	}
	return iaiOpenOut(key)
}

// iaiSpokenHair reads as one phrase rather than four, because four separate
// clauses about hair is not how anybody describes a person: "long curly black
// hair in a high ponytail".
func iaiSpokenHair(appearance IAIAppearance) string {
	length := strings.TrimSpace(strings.ToLower(appearance.HairLength))

	var words []string
	if spoken, found := iaiSpokenHairLength[length]; found {
		words = append(words, spoken)
	} else if spoken := iaiOpenOut(length); spoken != "" {
		words = append(words, spoken)
	}
	// Texture is dropped rather than reconciled. Somebody may answer both, and
	// a shaved head has no texture to describe.
	if !iaiHairLengthHasNoTexture[length] {
		if texture := iaiOpenOut(appearance.HairTexture); texture != "" {
			words = append(words, texture)
		}
	}
	if colour := iaiOpenOut(appearance.HairColour); colour != "" {
		words = append(words, colour)
	}

	shape := ""
	if _, isFeature := iaiHairFeature[strings.TrimSpace(strings.ToLower(appearance.HairStyle))]; !isFeature {
		shape = iaiSpokenHairShapeFor(appearance.HairStyle)
	}
	if len(words) == 0 && shape == "" {
		return ""
	}
	if len(words) == 0 {
		// Nothing describes the hair but what it is put into.
		return iaiPossessive(appearance.Gender) + " hair " + shape
	}

	hair := strings.Join(words, " ") + " hair"
	if shape != "" {
		hair += " " + shape
	}
	return hair
}

func iaiSpokenHairShapeFor(key string) string {
	key = strings.TrimSpace(strings.ToLower(key))
	if key == "" {
		return ""
	}
	if spoken, found := iaiSpokenHairShape[key]; found {
		return spoken
	}
	// A shape added to the form before this table gets a plain reading rather
	// than nothing: the description stays true, it just reads less well.
	opened := iaiOpenOut(key)
	return "in " + indefiniteArticle(opened) + " " + opened
}

// iaiOpenOut is a key spoken as English: high_ponytail becomes high ponytail.
func iaiOpenOut(key string) string {
	return strings.ReplaceAll(strings.TrimSpace(strings.ToLower(key)), "_", " ")
}

func joinIAIClauses(clauses []string) string {
	switch len(clauses) {
	case 0:
		return ""
	case 1:
		return clauses[0]
	case 2:
		return clauses[0] + " and " + clauses[1]
	}
	return strings.Join(clauses[:len(clauses)-1], ", ") + " and " + clauses[len(clauses)-1]
}

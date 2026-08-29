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
	"latino":     {"woman": "Latina", "man": "Latino", "": "Latino"},
	"white":      {"": "white"},
	"east_asian": {"": "East Asian"},
	"south_asian": {"": "South Asian"},
	"southeast_asian": {"": "Southeast Asian"},
	"middle_eastern":  {"": "Middle Eastern"},
	"pacific_islander": {"": "Pacific Islander"},
	"indigenous":       {"": "Indigenous"},
	"mixed":            {"": "mixed"},
	"other":            {"": ""},
}

// iaiSpokenBuild says a silhouette the way a person would. "plus_size" opened
// out reads as a clothing label rather than a body.
var iaiSpokenBuild = map[string]string{
	"plus_size": "full-figured",
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
	who := "A " + strings.Join(subject, " ")
	if appearance.HeightInches > 0 {
		who += fmt.Sprintf(", %d'%d\" tall", appearance.HeightInches/12, appearance.HeightInches%12)
	}

	var features []string
	if hair := iaiSpokenHair(appearance); hair != "" {
		features = append(features, hair)
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
	return who + ", with " + joinIAIClauses(features) + "."
}

// indefiniteArticle, because "a athletic build" is what not having one reads
// like. Vowel sounds, not vowels: nothing in these tables begins with a silent
// h or a long u, so the letter is enough and pretending otherwise would be
// machinery for a case that does not exist.
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
// hair worn in a high ponytail".
func iaiSpokenHair(appearance IAIAppearance) string {
	var words []string
	if length, found := iaiSpokenHairLength[strings.ToLower(appearance.HairLength)]; found {
		words = append(words, length)
	} else if length := iaiOpenOut(appearance.HairLength); length != "" {
		words = append(words, length)
	}
	if texture := iaiOpenOut(appearance.HairTexture); texture != "" {
		words = append(words, texture)
	}
	if colour := iaiOpenOut(appearance.HairColour); colour != "" {
		words = append(words, colour)
	}
	if len(words) == 0 && appearance.HairStyle == "" {
		return ""
	}

	hair := strings.TrimSpace(strings.Join(words, " ") + " hair")
	if shape := iaiOpenOut(appearance.HairStyle); shape != "" {
		hair += " worn in a " + shape
	}
	return hair
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

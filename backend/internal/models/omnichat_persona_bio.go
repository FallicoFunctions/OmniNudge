package models

import (
	"encoding/json"
	"regexp"
	"slices"
	"strings"
)

const maxPersonaBioRunes = 240

var characterDefinitionSyntax = regexp.MustCompile(`(?i)\b(character|backstory|personality|body|clothing|likes|job|quirks)\s*\(`)
var legacyPersonaField = regexp.MustCompile(`(?i)\b(Job|Personality|Likes)\s*\(([^)]*)\)`)
var legacyQuotedValue = regexp.MustCompile(`"(?:[^"\\]|\\.)*"`)

var publicPersonaTraits = map[string]string{
	"blunt": "blunt", "bright": "bright", "playful": "playful", "cheerful": "cheerful",
	"introvert": "introverted", "introverted": "introverted", "extrovert": "outgoing",
	"curious": "curious", "patient": "patient", "kind": "kind", "creative": "creative",
	"thoughtful": "thoughtful", "reserved": "reserved", "confident": "confident",
	"witty": "witty", "loyal": "loyal", "ambitious": "ambitious", "brave": "brave",
}

var publicPersonaInterests = map[string]string{
	"playing video games": "video games", "video games": "video games", "gaming": "video games",
	"computers": "technology", "technology": "technology", "reading": "reading",
	"into the sci-fi genre": "science fiction", "science fiction": "science fiction",
	"music": "music", "hiking": "hiking", "cooking": "cooking", "art": "art",
	"sports": "sports", "writing": "writing", "travel": "travel",
}

// PublicDescription is display copy, separate from Description, which older
// imported cards also use to hold their character instructions.
func (p BotPersona) PublicDescription() string {
	if p.Description != nil {
		if bio := plainPersonaBio(*p.Description); bio != "" {
			return bio
		}
		if strings.TrimSpace(*p.Description) != "" {
			if bio := legacyPersonaBio(*p.Description); bio != "" {
				return bio
			}
			return "A roleplay character with a story to discover."
		}
	}
	return ""
}

func legacyPersonaBio(raw string) string {
	var role string
	var traits, interests []string
	for _, field := range legacyPersonaField.FindAllStringSubmatch(raw, -1) {
		for _, quoted := range legacyQuotedValue.FindAllString(field[2], -1) {
			var value string
			if json.Unmarshal([]byte(quoted), &value) != nil {
				continue
			}
			value = strings.ToLower(strings.TrimSpace(value))
			switch strings.ToLower(field[1]) {
			case "job":
				if role == "" && len([]rune(value)) <= 60 {
					role = plainPersonaBio(value)
				}
			case "personality":
				if trait := publicPersonaTraits[value]; trait != "" && len(traits) < 3 && !slices.Contains(traits, trait) {
					traits = append(traits, trait)
				}
			case "likes":
				if interest := publicPersonaInterests[value]; interest != "" && len(interests) < 3 && !slices.Contains(interests, interest) {
					interests = append(interests, interest)
				}
			}
		}
	}
	if role == "" {
		return ""
	}
	phrase := role
	if len(traits) > 0 {
		phrase = strings.Join(traits, ", ") + " " + role
	}
	article := "A"
	if strings.ContainsRune("aeiou", rune(phrase[0])) {
		article = "An"
	}
	bio := article + " " + phrase + "."
	if len(interests) > 0 {
		list := interests[0]
		if len(interests) > 1 {
			list = strings.Join(interests[:len(interests)-1], ", ") + " and " + interests[len(interests)-1]
		}
		bio += " Enjoys " + list + "."
	}
	return plainPersonaBio(bio)
}

func plainPersonaBio(raw string) string {
	bio := strings.TrimSpace(raw)
	if bio == "" || characterDefinitionSyntax.MatchString(bio) ||
		strings.HasPrefix(bio, "{") || strings.HasPrefix(bio, "[") ||
		strings.Contains(bio, "{{") || strings.Contains(bio, "<START>") {
		return ""
	}
	bio = strings.Join(strings.Fields(bio), " ")
	runes := []rune(bio)
	if len(runes) <= maxPersonaBioRunes {
		return bio
	}
	// Prefer a complete sentence. Otherwise break at a word, never inside a
	// Unicode character, so an imported novel cannot fill a character card.
	short := string(runes[:maxPersonaBioRunes-1])
	if end := strings.LastIndexAny(short, ".!?"); end >= 40 {
		return short[:end+1]
	}
	if end := strings.LastIndex(short, " "); end > 0 {
		short = short[:end]
	}
	return strings.TrimRight(short, ",;: ") + "…"
}

// MarshalJSON uses the same concise bio for catalogs, private libraries and
// embedded conversation profiles. Prompt construction still reads the original
// field, and the owner's full-definition endpoint returns it explicitly.
func (p BotPersona) MarshalJSON() ([]byte, error) {
	type personaJSON BotPersona
	return json.Marshal(struct {
		personaJSON
		Description string `json:"description,omitempty"`
	}{personaJSON: personaJSON(p), Description: p.PublicDescription()})
}

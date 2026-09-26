package models

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/require"
)

func TestPersonaPublicBioSeparatesInstructionsFromDisplay(t *testing.T) {
	raw := `[character("Casey"){Backstory("A long character history.")Personality("Curious" + "Patient")Job("Private investigator")}] Messages [only include: dialogue and actions.]`
	persona := BotPersona{
		Name: "Casey", Description: &raw, FirstMessage: "Hello there.",
	}
	encoded, err := json.Marshal(BotConversation{Persona: &persona})
	require.NoError(t, err)
	require.Contains(t, string(encoded), "A curious, patient private investigator.")
	require.NotContains(t, string(encoded), "Backstory")
	require.NotContains(t, string(encoded), "Messages [only include")
	require.Equal(t, raw, *persona.Description, "display must not rewrite character instructions")
	require.Equal(t, "Hello there.", persona.FirstMessage)

	require.Equal(t, "A curious, patient private investigator.", persona.PublicDescription())
}

func TestPersonaPublicBioSummarizesOnlyReadableLegacyProfileFields(t *testing.T) {
	raw := `[character("Casey"){Backstory("A long character history.")Personality("Curious" + "Curious" + "Patient" + "INTERNAL INSTRUCTION")Job("Private investigator")Likes("INTERNAL INSTRUCTION" + "reading" + "reading" + "hiking")}]`
	persona := BotPersona{Description: &raw}
	require.Equal(t, "A curious, patient private investigator. Enjoys reading and hiking.", persona.PublicDescription())
	raw = `Job("{{private_instructions}}")`
	require.Equal(t, "A roleplay character with a story to discover.", persona.PublicDescription())
}

func TestPersonaPublicBioUsesPlainGeneratedDescriptions(t *testing.T) {
	description := "Maya is a 29-year-old private investigator. She recently opened her own agency."
	persona := BotPersona{Description: &description}
	require.Equal(t, description, persona.PublicDescription())
	encoded, err := json.Marshal(persona)
	require.NoError(t, err)
	var fields map[string]any
	require.NoError(t, json.Unmarshal(encoded, &fields))
	require.Equal(t, description, fields["description"])

	persona.Description = nil
	encoded, err = json.Marshal(persona)
	require.NoError(t, err)
	fields = map[string]any{}
	require.NoError(t, json.Unmarshal(encoded, &fields))
	require.NotContains(t, fields, "description")
}

func TestPersonaPublicBioBoundsAndRejectsDefinitionSyntax(t *testing.T) {
	for _, raw := range []string{
		`{"name":"Casey","system_prompt":"private instructions"}`,
		`Backstory("private instructions")`,
		`Talk as {{char}} to {{user}}.`,
		`<START> Sample dialogue`,
	} {
		require.Empty(t, plainPersonaBio(raw))
	}
	long := "A thoughtful artist. " + strings.Repeat("A longer biography follows. ", 20)
	bio := plainPersonaBio(long)
	require.LessOrEqual(t, len([]rune(bio)), maxPersonaBioRunes)
	require.True(t, strings.HasSuffix(bio, "."))
	unicodeBio := plainPersonaBio(strings.Repeat("é", 300))
	require.True(t, utf8.ValidString(unicodeBio))
	require.Len(t, []rune(unicodeBio), maxPersonaBioRunes)
}

package models

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestEveryProvenanceFieldSurvivesEncoding is the storage half of the check in
// internal/services/runpod/wiring_test.go.
//
// Decoding a field and storing it are two separate wirings, and model_id had
// neither: the decoder had no line for it, and the handler that builds this
// struct did not carry it. WorkerBuild beside it is decoded, bounded, warned
// about when empty and stored. That asymmetry is the whole failure -- a field
// is not wired because it sits next to one that is.
//
// Reflection rather than a list, because a list is one more thing to remember.
func TestEveryProvenanceFieldSurvivesEncoding(t *testing.T) {
	full := OmniChatGenerationProvenance{}
	value := reflect.ValueOf(&full).Elem()
	for i := 0; i < value.NumField(); i++ {
		field := value.Field(i)
		if !value.Type().Field(i).IsExported() {
			continue
		}
		switch field.Kind() {
		case reflect.String:
			field.SetString("set")
		case reflect.Float64, reflect.Float32:
			field.SetFloat(1.5)
		case reflect.Int, reflect.Int64, reflect.Int32:
			field.SetInt(7)
		case reflect.Bool:
			field.SetBool(true)
		default:
			t.Fatalf("OmniChatGenerationProvenance.%s is a kind this test cannot populate; "+
				"teach it that kind rather than deleting the field from the check",
				value.Type().Field(i).Name)
		}
	}

	raw, err := full.encode()
	require.NoError(t, err)

	var round map[string]any
	require.NoError(t, json.Unmarshal(raw, &round))
	for i := 0; i < value.NumField(); i++ {
		field := value.Type().Field(i)
		if !field.IsExported() {
			continue
		}
		key := strings.Split(field.Tag.Get("json"), ",")[0]
		require.NotEmptyf(t, key, "OmniChatGenerationProvenance.%s has no json tag, so it is "+
			"stored under its Go name or not at all", field.Name)
		require.Containsf(t, round, key,
			"OmniChatGenerationProvenance.%s (%q) did not survive encode(). A field added here "+
				"is stored by nothing until encode bounds it and the handler fills it in.",
			field.Name, key)
	}
}

// And the bounding half: every text field is cut, not just the ones somebody
// remembered. An unbounded string on this struct is provider text going
// straight into a jsonb column.
func TestEveryProvenanceTextFieldIsBounded(t *testing.T) {
	long := strings.Repeat("x", omniChatProvenanceMaxPromptRunes*2)
	full := OmniChatGenerationProvenance{}
	value := reflect.ValueOf(&full).Elem()
	for i := 0; i < value.NumField(); i++ {
		if value.Field(i).Kind() == reflect.String && value.Type().Field(i).IsExported() {
			value.Field(i).SetString(long)
		}
	}

	raw, err := full.encode()
	require.NoError(t, err)
	var round map[string]string
	require.NoError(t, json.Unmarshal(raw, &round))
	for key, stored := range round {
		require.Lessf(t, len([]rune(stored)), len([]rune(long)),
			"provenance field %q was stored at full length. Every text field here is provider "+
				"output landing in a jsonb column and must be bounded in encode().", key)
	}
}

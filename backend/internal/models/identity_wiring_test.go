package models

import (
	"reflect"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestEveryTextFieldOnTheIdentityProfileIsBoundedOnRead walks the profile and
// every struct nested in it, and requires each string to be cut by
// NormalizeOmniChatMediaIdentityProfile.
//
// This is the read path, and it is the one that matters: a profile arrives out
// of a jsonb column that a migration, an admin edit or a future writer can put
// anything into. The writer trimming its own output defends nothing here.
//
// The style profile was added to this struct and skipped the normaliser
// entirely, which made it the only text on the type able to grow a prompt
// without limit -- found by a review asking what the neighbouring fields did
// that it did not. Nested, so a new sub-struct is covered without anybody
// adding a line.
func TestEveryTextFieldOnTheIdentityProfileIsBoundedOnRead(t *testing.T) {
	const overlong = 4001
	long := strings.Repeat("x", overlong)

	profile := OmniChatMediaIdentityProfile{}
	fillStrings(reflect.ValueOf(&profile).Elem(), long)

	normalized := NormalizeOmniChatMediaIdentityProfile(profile)
	unbounded := unboundedStrings(reflect.ValueOf(normalized), "OmniChatMediaIdentityProfile", overlong)
	require.Emptyf(t, unbounded,
		"these text fields survived normalisation at full length: %s\n"+
			"Every string on this struct is read back out of a jsonb column and lands in a "+
			"prompt. Bound it in NormalizeOmniChatMediaIdentityProfile beside the others.",
		strings.Join(unbounded, ", "))
}

// fillStrings sets every string on a struct, and on any struct inside it.
func fillStrings(value reflect.Value, with string) {
	for i := 0; i < value.NumField(); i++ {
		if !value.Type().Field(i).IsExported() {
			continue
		}
		field := value.Field(i)
		switch field.Kind() {
		case reflect.String:
			field.SetString(with)
		case reflect.Struct:
			fillStrings(field, with)
		}
	}
}

// unboundedStrings names every string still at the length it was given.
//
// RenderStyle is skipped: it is an enum the normaliser blanks rather than cuts,
// so an unrecognised medium is already refused by a different rule.
func unboundedStrings(value reflect.Value, path string, overlong int) []string {
	var found []string
	for i := 0; i < value.NumField(); i++ {
		name := value.Type().Field(i).Name
		if !value.Type().Field(i).IsExported() || name == "RenderStyle" {
			continue
		}
		field := value.Field(i)
		switch field.Kind() {
		case reflect.String:
			if len([]rune(field.String())) >= overlong {
				found = append(found, path+"."+name)
			}
		case reflect.Struct:
			found = append(found, unboundedStrings(field, path+"."+name, overlong)...)
		}
	}
	return found
}

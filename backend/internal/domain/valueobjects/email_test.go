package valueobjects

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewEmail(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantError error
	}{
		{"valid email", "user@example.com", nil},
		{"valid with subdomain", "user@mail.example.com", nil},
		{"empty email", "", ErrEmailEmpty},
		{"whitespace only", "   ", ErrEmailEmpty},
		{"missing @", "userexample.com", ErrEmailInvalid},
		{"missing domain", "user@", ErrEmailInvalid},
		{"missing local part", "@example.com", ErrEmailInvalid},
		{"no TLD", "user@example", ErrEmailInvalid},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			email, err := NewEmail(tt.input)
			if tt.wantError != nil {
				require.ErrorIs(t, err, tt.wantError)
			} else {
				require.NoError(t, err)
				assert.NotEmpty(t, email.String())
			}
		})
	}
}

func TestEmail_Normalization(t *testing.T) {
	email1, _ := NewEmail("User@Example.COM")
	email2, _ := NewEmail("user@example.com")

	assert.Equal(t, "user@example.com", email1.String())
	assert.True(t, email1.Equals(email2))
}

func TestEmail_JSON(t *testing.T) {
	email, _ := NewEmail("test@example.com")

	data, err := json.Marshal(email)
	require.NoError(t, err)
	assert.Equal(t, `"test@example.com"`, string(data))

	var decoded Email
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)
	assert.Equal(t, email, decoded)
}

func TestNewEmail_RejectLeadingAndConsecutiveDots(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{"leading dot in local", ".user@example.com"},
		{"trailing dot in local", "user.@example.com"},
		{"consecutive dots in local", "user..name@example.com"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewEmail(tt.input)
			require.ErrorIs(t, err, ErrEmailInvalid)
		})
	}
}

func TestEmailFromString(t *testing.T) {
	// EmailFromString bypasses validation — useful for legacy/trusted DB values.
	e := EmailFromString("legacy..email@old.example")
	assert.Equal(t, "legacy..email@old.example", e.String())
}

func TestEmail_JSON_SpecialCharacters(t *testing.T) {
	email, _ := NewEmail("test+tag@example.com")

	data, err := json.Marshal(email)
	require.NoError(t, err)

	var decoded Email
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)
	assert.Equal(t, email.String(), decoded.String())
}

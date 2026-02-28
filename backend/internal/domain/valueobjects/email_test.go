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

func TestNewEmail_SingleCharAddresses(t *testing.T) {
	// Single-character local part and/or domain label must be accepted.
	tests := []string{"a@b.co", "a@example.com", "user@x.io"}
	for _, addr := range tests {
		_, err := NewEmail(addr)
		require.NoError(t, err, "address %q should be valid", addr)
	}
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

func TestNewEmail_RejectConsecutiveHyphensInDomain(t *testing.T) {
	_, err := NewEmail("user@ex--ample.com")
	require.ErrorIs(t, err, ErrEmailInvalid)
}

func TestNewEmail_RejectTrailingSpecialInLocalPart(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{"trailing plus", "user+@example.com"},
		{"trailing minus", "user-@example.com"},
		{"trailing percent", "user%@example.com"},
		{"trailing underscore", "user_@example.com"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewEmail(tt.input)
			require.ErrorIs(t, err, ErrEmailInvalid)
		})
	}
}

func TestNewEmail_RejectSingleSpecialLocalPart(t *testing.T) {
	tests := []string{"+@example.com", "-@example.com", "%@example.com", "_@example.com"}
	for _, addr := range tests {
		_, err := NewEmail(addr)
		require.ErrorIs(t, err, ErrEmailInvalid, "address %q should be rejected", addr)
	}
}

func TestEmailFromString(t *testing.T) {
	// EmailFromString bypasses validation — useful for legacy/trusted DB values.
	// Value is normalised to lower-case for consistent comparisons.
	e := EmailFromString("legacy..email@old.example")
	assert.Equal(t, "legacy..email@old.example", e.String())

	// Normalises case.
	e2 := EmailFromString("User@Example.COM")
	assert.Equal(t, "user@example.com", e2.String())

	// Two EmailFromString values with the same address compare equal regardless
	// of the original casing.
	e3 := EmailFromString("user@example.com")
	assert.True(t, e2.Equals(e3))
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

package valueobjects

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewPassword(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantError error
	}{
		{"valid password", "Password123", nil},
		{"too short", "Pass1", ErrPasswordTooShort},
		{"no uppercase", "password123", ErrPasswordTooWeak},
		{"no lowercase", "PASSWORD123", ErrPasswordTooWeak},
		{"no numbers", "PasswordOnly", ErrPasswordTooWeak},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			password, err := NewPassword(tt.input)
			if tt.wantError != nil {
				require.ErrorIs(t, err, tt.wantError)
			} else {
				require.NoError(t, err)
				assert.NotEmpty(t, password.Hash())
			}
		})
	}
}

func TestPassword_Verify(t *testing.T) {
	password, err := NewPassword("Password123")
	require.NoError(t, err)

	assert.True(t, password.Verify("Password123"))
	assert.False(t, password.Verify("WrongPassword"))
	assert.False(t, password.Verify(""))
}

func TestPasswordFromHash(t *testing.T) {
	original, err := NewPassword("Password123")
	require.NoError(t, err)

	loaded := PasswordFromHash(original.Hash())

	assert.True(t, loaded.Verify("Password123"))
	assert.False(t, loaded.Verify("WrongPassword"))
	assert.Equal(t, original.Hash(), loaded.Hash())
}

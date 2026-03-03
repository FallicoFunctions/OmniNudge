package valueobjects

import (
	"strconv"
	"strings"
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

func TestNewPassword_BcryptCost(t *testing.T) {
	// Bcrypt hash format: $2a$<cost>$<22-char salt><31-char hash>
	// This test guards against accidentally lowering the cost below 12.
	pwd, err := NewPassword("Password123")
	require.NoError(t, err)

	hash := pwd.Hash()
	parts := strings.Split(hash, "$")
	require.Len(t, parts, 4, "bcrypt hash must have format $2a$cost$salt+hash")

	cost, err := strconv.Atoi(parts[2])
	require.NoError(t, err, "bcrypt cost field must be numeric")
	assert.GreaterOrEqual(t, cost, 12, "bcrypt cost must be >= 12 per CODING_STANDARDS.md security rules")
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

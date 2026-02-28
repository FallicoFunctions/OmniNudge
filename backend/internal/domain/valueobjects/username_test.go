package valueobjects

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewUsername(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantError error
	}{
		{"valid username", "testuser", nil},
		{"valid with numbers", "test123", nil},
		{"valid with underscore", "test_user", nil},
		{"valid with hyphen", "test-user", nil},
		{"minimum length", "abc", nil},
		{"maximum length", "abcdefghijklmnopqrst", nil}, // exactly 20 chars
		{"too short", "ab", ErrUsernameTooShort},
		{"too long", "thisisaverylongusername1", ErrUsernameTooLong},
		{"invalid chars @", "test@user", ErrUsernameInvalidChar},
		{"spaces not allowed", "test user", ErrUsernameInvalidChar},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			username, err := NewUsername(tt.input)
			if tt.wantError != nil {
				require.ErrorIs(t, err, tt.wantError)
			} else {
				require.NoError(t, err)
				assert.NotEmpty(t, username.String())
			}
		})
	}
}

func TestUsername_JSON(t *testing.T) {
	username, _ := NewUsername("testuser")

	data, err := json.Marshal(username)
	require.NoError(t, err)
	assert.Equal(t, `"testuser"`, string(data))

	var decoded Username
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)
	assert.Equal(t, username, decoded)
}

func TestUsername_Equals(t *testing.T) {
	u1, _ := NewUsername("testuser")
	u2, _ := NewUsername("testuser")
	u3, _ := NewUsername("otheruser")

	assert.True(t, u1.Equals(u2))
	assert.False(t, u1.Equals(u3))
}

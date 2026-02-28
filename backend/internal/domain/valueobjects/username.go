package valueobjects

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

var (
	ErrUsernameTooShort    = errors.New("username must be at least 3 characters")
	ErrUsernameTooLong     = errors.New("username must be at most 20 characters")
	ErrUsernameInvalidChar = errors.New("username can only contain letters, numbers, hyphens, and underscores")
)

var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// Username is an immutable, self-validating value object for usernames.
type Username struct {
	value string
}

// NewUsername creates and validates a Username value object.
func NewUsername(username string) (Username, error) {
	username = strings.TrimSpace(username)

	if len(username) < 3 {
		return Username{}, ErrUsernameTooShort
	}

	if len(username) > 20 {
		return Username{}, ErrUsernameTooLong
	}

	if !usernameRegex.MatchString(username) {
		return Username{}, ErrUsernameInvalidChar
	}

	return Username{value: username}, nil
}

// UsernameFromString creates a Username bypassing validation.
// Use only when loading from the database where the value is already trusted
// (e.g. legacy records that pre-date the length/charset rules).
func UsernameFromString(raw string) Username {
	return Username{value: raw}
}

// String returns the username.
func (u Username) String() string {
	return u.value
}

// Equals reports whether two Username values are identical.
func (u Username) Equals(other Username) bool {
	return u.value == other.value
}

// MarshalJSON serialises the username as a JSON string.
func (u Username) MarshalJSON() ([]byte, error) {
	return json.Marshal(u.value)
}

// UnmarshalJSON deserialises and validates the username from JSON.
func (u *Username) UnmarshalJSON(data []byte) error {
	var str string
	if err := json.Unmarshal(data, &str); err != nil {
		return err
	}

	username, err := NewUsername(str)
	if err != nil {
		return err
	}

	*u = username
	return nil
}

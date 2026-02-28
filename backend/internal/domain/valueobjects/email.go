package valueobjects

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

var (
	ErrEmailEmpty   = errors.New("email cannot be empty")
	ErrEmailInvalid = errors.New("email format is invalid")
)

// Compile regex at package level for performance.
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// Email is an immutable, self-validating value object for email addresses.
type Email struct {
	value string
}

// NewEmail creates and validates an Email value object.
// The address is normalised to lower-case on success.
func NewEmail(email string) (Email, error) {
	email = strings.TrimSpace(email)

	if email == "" {
		return Email{}, ErrEmailEmpty
	}

	if !emailRegex.MatchString(email) {
		return Email{}, ErrEmailInvalid
	}

	return Email{value: strings.ToLower(email)}, nil
}

// EmailFromString creates an Email bypassing validation.
// Use only when loading from the database where the value is already trusted
// (e.g. a stored address that fails the current regex due to an edge case, or
// a malformed legacy row that must not block all operations on that user).
func EmailFromString(raw string) Email {
	return Email{value: raw}
}

// String returns the normalised email address.
func (e Email) String() string {
	return e.value
}

// Equals reports whether two Email values are identical.
func (e Email) Equals(other Email) bool {
	return e.value == other.value
}

// MarshalJSON serialises the email as a JSON string.
func (e Email) MarshalJSON() ([]byte, error) {
	return json.Marshal(e.value)
}

// UnmarshalJSON deserialises and validates the email from JSON.
func (e *Email) UnmarshalJSON(data []byte) error {
	var str string
	if err := json.Unmarshal(data, &str); err != nil {
		return err
	}

	email, err := NewEmail(str)
	if err != nil {
		return err
	}

	*e = email
	return nil
}

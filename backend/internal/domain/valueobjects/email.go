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

// emailRegex validates a simplified but practical email format.
// Rules enforced:
//   - Local part: alphanumerics plus . _ % + -; no leading/trailing/consecutive dots.
//   - Domain: alphanumerics and hyphens separated by dots; TLD ≥ 2 chars.
//
// This is intentionally not RFC 5321-exhaustive; it rejects pathological
// addresses that would cause problems in practice (e.g. "..user@example.com").
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9_%+\-]([a-zA-Z0-9._%+\-]*[a-zA-Z0-9_%+\-])?@[a-zA-Z0-9]([a-zA-Z0-9.\-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$`)

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

	// Reject consecutive dots in the local part (the regex allows them via
	// the middle character class which includes ".").
	atIdx := strings.Index(email, "@")
	if strings.Contains(email[:atIdx], "..") {
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

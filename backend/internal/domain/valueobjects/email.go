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
// Rules enforced by the regex:
//   - Local part: must start AND end with an alphanumeric character;
//     middle characters may include . _ % + -
//   - Domain: must start and end with alphanumeric; hyphens only in the middle.
//   - TLD: ≥ 2 alpha characters.
//
// Additional post-regex checks (see NewEmail) handle:
//   - Consecutive dots in the local part ("user..name@")
//   - Consecutive hyphens in the domain ("ex--ample.com")
//
// This is intentionally not RFC 5321-exhaustive; it rejects pathological
// addresses that cause practical problems while accepting all common forms.
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9.\-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$`)

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

	atIdx := strings.Index(email, "@")
	localPart := email[:atIdx]
	domainPart := email[atIdx+1:]

	// Reject consecutive dots in the local part ("user..name@").
	if strings.Contains(localPart, "..") {
		return Email{}, ErrEmailInvalid
	}

	// Reject consecutive hyphens in the domain ("ex--ample.com").
	if strings.Contains(domainPart, "--") {
		return Email{}, ErrEmailInvalid
	}

	return Email{value: strings.ToLower(email)}, nil
}

// EmailFromString creates an Email bypassing validation.
// Use only when loading from the database where the value is already trusted
// (e.g. a stored address that fails the current regex due to an edge case, or
// a malformed legacy row that must not block all operations on that user).
// The value is normalised to lower-case for consistent comparisons.
func EmailFromString(raw string) Email {
	return Email{value: strings.ToLower(raw)}
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

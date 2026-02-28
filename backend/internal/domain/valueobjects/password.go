package valueobjects

import (
	"errors"
	"regexp"

	"golang.org/x/crypto/bcrypt"
)

const bcryptCost = 12 // Minimum cost per CODING_STANDARDS.md security rules.

var (
	ErrPasswordTooShort   = errors.New("password must be at least 8 characters")
	ErrPasswordTooWeak    = errors.New("password must contain uppercase, lowercase, and numbers")
	ErrPasswordHashFailed = errors.New("failed to hash password")
)

var (
	hasUpperRegex  = regexp.MustCompile(`[A-Z]`)
	hasLowerRegex  = regexp.MustCompile(`[a-z]`)
	hasNumberRegex = regexp.MustCompile(`[0-9]`)
)

// Password is an immutable value object representing a bcrypt-hashed password.
// Plain text is never stored.
type Password struct {
	hash string
}

// NewPassword creates a Password from plain text, validating strength then hashing.
func NewPassword(plainText string) (Password, error) {
	if len(plainText) < 8 {
		return Password{}, ErrPasswordTooShort
	}

	if !hasUpperRegex.MatchString(plainText) ||
		!hasLowerRegex.MatchString(plainText) ||
		!hasNumberRegex.MatchString(plainText) {
		return Password{}, ErrPasswordTooWeak
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(plainText), bcryptCost)
	if err != nil {
		return Password{}, ErrPasswordHashFailed
	}

	return Password{hash: string(hash)}, nil
}

// PasswordFromHash creates a Password from an existing bcrypt hash (loading from DB).
func PasswordFromHash(hash string) Password {
	return Password{hash: hash}
}

// Hash returns the bcrypt hash string.
func (p Password) Hash() string {
	return p.hash
}

// Verify checks whether plain text matches the stored hash.
func (p Password) Verify(plainText string) bool {
	return bcrypt.CompareHashAndPassword([]byte(p.hash), []byte(plainText)) == nil
}

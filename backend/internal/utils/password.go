package utils

import (
	"testing"

	"golang.org/x/crypto/bcrypt"
)

// productionCost is the bcrypt cost for every password a real server stores.
const productionCost = 12

// passwordCost is bcrypt's lowest cost inside a test binary and productionCost
// everywhere else. Each step doubles the work, so 12 is 256 times 4: hashing
// for test users was the largest single cost of the backend suite, 37% of the
// handlers package's CPU under -race. A server binary is never a test binary.
func passwordCost() int {
	if testing.Testing() {
		return bcrypt.MinCost
	}
	return productionCost
}

// HashPassword hashes a password with bcrypt.
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), passwordCost())
	return string(bytes), err
}

// CheckPassword compares a hashed password with a plain text password
func CheckPassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}

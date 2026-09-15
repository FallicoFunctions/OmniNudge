package utils

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

func TestPasswordsHashCheaplyOnlyInsideTests(t *testing.T) {
	hash, err := HashPassword("correct-horse")
	require.NoError(t, err)

	cost, err := bcrypt.Cost([]byte(hash))
	require.NoError(t, err)
	assert.Equal(t, bcrypt.MinCost, cost, "a test binary hashes at bcrypt's lowest cost")
	assert.NoError(t, CheckPassword(hash, "correct-horse"))
	assert.Error(t, CheckPassword(hash, "wrong-horse"))

	assert.Equal(t, 12, productionCost, "a server keeps cost 12")
}

//go:build integration

package integration

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// With TEST_DATABASE_URL unset, getTestDB once skipped every test in this
// package, and a skipped suite prints ok. The review hook replays controls in
// exactly that environment, so a control over these tests could never fail.
func TestGetTestDBRunsWithoutTheVariable(t *testing.T) {
	t.Setenv("TEST_DATABASE_URL", "")

	opened := false
	t.Run("open", func(t *testing.T) {
		getTestDB(t)
		opened = true
	})
	require.True(t, opened, "getTestDB skipped with TEST_DATABASE_URL empty")
}

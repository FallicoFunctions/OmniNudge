package database

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Every package's tests must reach Postgres through TestDSN. A test that dials
// a fixed address shares one database with every package running beside it,
// and security's SQL injection test did exactly that, as a user CI does not
// have, so it skipped on every run and nobody noticed.
func TestNoTestDialsAFixedDatabaseAddress(t *testing.T) {
	internal := filepath.Dir(startDir)
	fixedAddress := `"postgres` + `://` // split, or this file would match itself
	var offenders []string
	err := filepath.WalkDir(internal, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}
		if filepath.Base(path) == "test_helpers.go" && filepath.Base(filepath.Dir(path)) == "database" {
			return nil
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if strings.Contains(string(src), fixedAddress) {
			rel, _ := filepath.Rel(internal, path)
			offenders = append(offenders, rel)
		}
		return nil
	})
	require.NoError(t, err)
	assert.Empty(t, offenders, "open the test database with database.NewTest or database.TestDSN, not a fixed address")
}

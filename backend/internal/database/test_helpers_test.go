package database

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPackageDatabaseName(t *testing.T) {
	cases := []struct {
		name, base, dir, want string
	}{
		{"a package under internal", "omninudge_test", "/src/backend/internal/handlers", "omninudge_test_handlers"},
		{"a nested package", "omninudge_test", "/src/backend/internal/omnigame/repository", "omninudge_test_omnigame_repository"},
		{"two packages with one base name stay apart", "omninudge_test", "/src/backend/internal/repository", "omninudge_test_repository"},
		{"a base name without test gains it", "omninudge", "/src/backend/internal/models", "omninudge_test_models"},
		{"characters Postgres would need quoted", "OmniNudge_Test", "/src/backend/internal/omni-rave.world", "omninudge_test_omni_rave_world"},
		{"a directory outside internal", "omninudge_test", "/src/backend/cmd/seed", "omninudge_test_seed"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assert.Equal(t, c.want, packageDatabaseName(c.base, c.dir))
		})
	}
}

// Postgres keeps only 63 bytes of a name. Cut short, two long package paths that
// differ only at the end would land in one database and truncate each other.
func TestPackageDatabaseNameStaysDistinctPastPostgresLimit(t *testing.T) {
	long := "/src/backend/internal/" + strings.Repeat("deeply_nested/", 5)
	a := packageDatabaseName("omninudge_test", long+"alpha")
	b := packageDatabaseName("omninudge_test", long+"beta")

	assert.LessOrEqual(t, len(a), postgresMaxIdentifier)
	assert.LessOrEqual(t, len(b), postgresMaxIdentifier)
	assert.NotEqual(t, a, b)
	assert.Contains(t, a, "test")
	assert.Equal(t, a, packageDatabaseName("omninudge_test", long+"alpha"), "the same package must find its database again")
}

// internal/handlers has a test that calls t.Chdir(t.TempDir()). Whenever it ran
// before the package's first NewTest, the whole package's database would have
// been named after the temp directory.
func TestPackageDirIsReadBeforeAnyTestMoves(t *testing.T) {
	t.Chdir(t.TempDir())

	dir, err := testPackageDir()
	require.NoError(t, err)
	assert.Equal(t, "omninudge_test_database", packageDatabaseName("omninudge_test", dir))
}

// The whole point: this package's tests do not share a database, or a lock,
// with any other package's.
func TestNewTestConnectsToThisPackagesOwnDatabase(t *testing.T) {
	db, err := NewTest()
	require.NoError(t, err)
	defer db.Close()

	var name string
	require.NoError(t, db.Pool.QueryRow(context.Background(), "SELECT current_database()").Scan(&name))
	assert.True(t, strings.HasSuffix(name, "_database"), "connected to %q, not this package's database", name)
	assert.Contains(t, name, "test")
}

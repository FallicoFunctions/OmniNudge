// Package testutil provides shared test helpers for database setup, fixture
// creation, and common assertions. It is imported only by test code; never
// linked into the production binary.
package testutil

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/database"
)

// TestDatabase wraps a test database connection with helpers for test
// setup and teardown.
type TestDatabase struct {
	DB   *database.DB
	Pool *pgxpool.Pool
}

// NewTestDatabase creates a test DB connection and runs all pending migrations.
// It calls t.Fatal if any step fails. A cleanup function is registered via
// t.Cleanup that resets all table data after the test finishes, so each test
// starts from a clean state without needing to drop and recreate the schema.
func NewTestDatabase(t *testing.T) *TestDatabase {
	t.Helper()

	db, err := database.NewTest()
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}

	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		db.Close()
		t.Fatalf("run migrations: %v", err)
	}

	td := &TestDatabase{DB: db, Pool: db.Pool}

	t.Cleanup(func() {
		resetCtx := context.Background()
		if err := database.ResetTestData(resetCtx, db); err != nil {
			t.Logf("reset test data: %v", err)
		}
		db.Close()
	})

	return td
}

package database

import (
	"context"
	"fmt"
	"os"
	"strings"
)

// Database is kept for backward compatibility with older tests that referenced
// database.Database instead of database.DB.
type Database = DB

const (
	defaultTestDSN      = "postgres://postgres:postgres@localhost:5432/omninudge_test?sslmode=disable"
	testAdvisoryLockKey = int64(0x6f6d6e69) // 'omni'
)

// NewTest creates a database connection that can be used inside tests.
// It prefers TEST_DATABASE_URL if set, falls back to DATABASE_URL, and
// finally uses a sensible local default. Tests are expected to run migrations
// or cleanup steps as needed after obtaining the handle.
func NewTest() (*Database, error) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}
	if dsn == "" {
		dsn = defaultTestDSN
	}

	db, err := New(dsn)
	if err != nil {
		return nil, err
	}

	if err := db.acquireTestLock(testAdvisoryLockKey); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}

// ResetTestData truncates all tables in the current database (except schema_migrations)
// and resets identities. It refuses to run unless the database looks like a test DB.
func ResetTestData(ctx context.Context, db *Database) error {
	if db == nil || db.Pool == nil {
		return fmt.Errorf("nil database")
	}

	if err := ensureTestDatabase(ctx, db); err != nil {
		return err
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT quote_ident(tablename)
		FROM pg_tables
		WHERE schemaname = 'public'
		  AND tablename <> 'schema_migrations'
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			return err
		}
		tables = append(tables, table)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(tables) == 0 {
		return nil
	}

	query := fmt.Sprintf("TRUNCATE TABLE %s RESTART IDENTITY CASCADE", strings.Join(tables, ", "))
	_, err = db.Pool.Exec(ctx, query)
	return err
}

func ensureTestDatabase(ctx context.Context, db *Database) error {
	if os.Getenv("TEST_DATABASE_URL") != "" {
		return nil
	}

	var name string
	if err := db.Pool.QueryRow(ctx, "SELECT current_database()").Scan(&name); err != nil {
		return err
	}

	if strings.Contains(strings.ToLower(name), "test") {
		return nil
	}

	return fmt.Errorf("refusing to reset non-test database %q; set TEST_DATABASE_URL or use a *_test database", name)
}

// DropSchema drops and recreates the public schema to ensure a completely clean start.
func DropSchema(ctx context.Context, db *Database) error {
	if db == nil || db.Pool == nil {
		return fmt.Errorf("nil database")
	}

	if err := ensureTestDatabase(ctx, db); err != nil {
		return err
	}

	_, err := db.Pool.Exec(ctx, `
		DROP SCHEMA public CASCADE;
		CREATE SCHEMA public;
		GRANT ALL ON SCHEMA public TO public;
	`)
	return err
}

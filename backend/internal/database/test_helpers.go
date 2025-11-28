package database

import (
	"os"
)

// Database is kept for backward compatibility with older tests that referenced
// database.Database instead of database.DB.
type Database = DB

const defaultTestDSN = "postgres://postgres:postgres@localhost:5432/chatreddit_test?sslmode=disable"

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

	return New(dsn)
}

package database

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	zlog "github.com/rs/zerolog/log"
)

// Database is kept for backward compatibility with older tests that referenced
// database.Database instead of database.DB.
type Database = DB

const (
	// #nosec G101 -- fixed localhost-only credentials for the disposable test database, never a deployed secret.
	defaultTestDSN       = "postgres://postgres:postgres@localhost:5432/omninudge_test?sslmode=disable"
	defaultTestMaxConns  = int32(4)
	defaultTestMinConns  = int32(0)
	testAdvisoryLockKey  = int64(0x6f6d6e69) // 'omni'
	testOperationTimeout = 30 * time.Second
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

	// Integration tests intentionally use a small, on-demand pool. A separate
	// pool is created for every test, and the advisory lock reserves one
	// connection for the lifetime of that test. The production defaults (50/10)
	// would exhaust PostgreSQL quickly when `go test` runs several packages in
	// parallel, causing unrelated tests to block until their package timeout.
	maxConns := testPoolIntEnv("TEST_DB_MAX_CONNS", "DB_MAX_CONNS", defaultTestMaxConns, false)
	minConns := testPoolIntEnv("TEST_DB_MIN_CONNS", "DB_MIN_CONNS", defaultTestMinConns, true)
	if maxConns < 2 {
		return nil, fmt.Errorf("test database pool must allow at least 2 connections (got %d)", maxConns)
	}
	db, err := newWithPoolLimits(dsn, maxConns, minConns)
	if err != nil {
		return nil, err
	}

	if err := db.acquireTestLock(testAdvisoryLockKey); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}

func testPoolIntEnv(testKey, fallbackKey string, defaultVal int32, allowZero bool) int32 {
	key := testKey
	value, ok := os.LookupEnv(testKey)
	if !ok {
		key = fallbackKey
		value, ok = os.LookupEnv(fallbackKey)
	}
	if !ok || value == "" {
		return defaultVal
	}

	minimum := int32(1)
	if allowZero {
		minimum = 0
	}
	parsed, err := strconv.ParseInt(value, 10, 32)
	if err != nil || parsed < int64(minimum) {
		zlog.Warn().
			Str("key", key).
			Str("value", value).
			Int("default", int(defaultVal)).
			Msg("database: invalid test pool size env var; using default")
		return defaultVal
	}
	return int32(parsed)
}

// ResetTestData truncates all tables in the current database (except schema_migrations)
// and resets identities. It refuses to run unless the database looks like a test DB.
func ResetTestData(ctx context.Context, db *Database) error {
	if db == nil || db.Pool == nil {
		return fmt.Errorf("nil database")
	}
	resetCtx, cancel := context.WithTimeout(ctx, testOperationTimeout)
	defer cancel()
	ctx = resetCtx

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

	var tables []string
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			return err
		}
		tables = append(tables, table)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	// Release the pool connection before acquiring another one for TRUNCATE.
	// This matters for the intentionally small integration-test pool and avoids
	// a self-inflicted wait when the advisory-lock connection is reserved.
	rows.Close()
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

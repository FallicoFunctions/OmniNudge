package database

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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

// postgresMaxIdentifier is how many bytes of a database name Postgres keeps.
const postgresMaxIdentifier = 63

var (
	testDSNOnce sync.Once
	testDSN     string
	errTestDSN  error
	nonNameRune = regexp.MustCompile(`[^a-z0-9]+`)

	// A test binary starts in its package's directory. Read it now, before any
	// test runs: a test that calls t.Chdir before the first NewTest would
	// otherwise name the whole package's database after its temp directory.
	startDir, errStartDir = os.Getwd()
)

// testPackageDir is the directory the test binary started in.
func testPackageDir() (string, error) {
	return startDir, errStartDir
}

// TestDSN returns the connection string of this test binary's own database,
// creating the database on first use.
//
// Every package once shared one database, and every test held one advisory lock
// on it, so the whole suite ran one test at a time whatever `go test -p` said.
// Advisory locks belong to a database, so a database per package keeps the lock
// meaning "one test at a time in this package" and lets packages run side by
// side. The database is kept between runs, so later runs only check migrations.
//
// The base address is TEST_DATABASE_URL, else DATABASE_URL, else a local
// default; its user must be allowed to create databases.
func TestDSN() (string, error) {
	testDSNOnce.Do(func() {
		base := os.Getenv("TEST_DATABASE_URL")
		if base == "" {
			base = os.Getenv("DATABASE_URL")
		}
		if base == "" {
			base = defaultTestDSN
		}
		dir, err := testPackageDir()
		if err != nil {
			errTestDSN = fmt.Errorf("find the test package directory: %w", err)
			return
		}
		testDSN, errTestDSN = ensurePackageDatabase(base, dir)
	})
	return testDSN, errTestDSN
}

// ensurePackageDatabase creates the package's database on the base server if it
// is missing, and returns the base address pointed at it.
func ensurePackageDatabase(base, packageDir string) (string, error) {
	parsed, err := url.Parse(base)
	if err != nil || parsed.Path == "" || parsed.Path == "/" {
		return "", fmt.Errorf("test database address must be a postgres:// URL with a database name")
	}
	name := packageDatabaseName(strings.TrimPrefix(parsed.Path, "/"), packageDir)

	ctx, cancel := context.WithTimeout(context.Background(), testOperationTimeout)
	defer cancel()
	conn, err := pgx.Connect(ctx, base)
	if err != nil {
		return "", fmt.Errorf("connect to the base test database: %w", err)
	}
	defer func() { _ = conn.Close(context.Background()) }()

	var exists bool
	if err := conn.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)", name).Scan(&exists); err != nil {
		return "", fmt.Errorf("look up test database %q: %w", name, err)
	}
	if !exists {
		_, err := conn.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize())
		var pgErr *pgconn.PgError
		switch {
		case err == nil:
		case errors.As(err, &pgErr) && pgErr.Code == "42P04":
			// Another run of the same package created it first.
		case errors.As(err, &pgErr) && pgErr.Code == "42501":
			return "", fmt.Errorf("the test database user cannot create databases, and each test package needs its own; grant it once with: ALTER ROLE %s CREATEDB", parsed.User.Username())
		default:
			return "", fmt.Errorf("create test database %q: %w", name, err)
		}
	}

	parsed.Path = "/" + name
	return parsed.String(), nil
}

// packageDatabaseName names a package's test database after its directory under
// internal/, beneath the base name: omninudge_test_handlers,
// omninudge_test_omnigame_repository. The name always contains "test", which is
// what ResetTestData checks before it truncates anything.
func packageDatabaseName(base, packageDir string) string {
	dir := filepath.ToSlash(packageDir)
	rel := filepath.Base(packageDir)
	if i := strings.LastIndex(dir, "/internal/"); i >= 0 {
		rel = dir[i+len("/internal/"):]
	}
	suffix := strings.Trim(nonNameRune.ReplaceAllString(strings.ToLower(rel), "_"), "_")

	prefix := strings.ToLower(base)
	if !strings.Contains(prefix, "test") {
		prefix += "_test"
	}
	name := prefix + "_" + suffix
	if len(name) <= postgresMaxIdentifier {
		return name
	}
	// Postgres would cut a longer name short, and two packages could then share
	// one database without either knowing.
	sum := sha256.Sum256([]byte(name))
	tag := hex.EncodeToString(sum[:])[:8]
	return name[:postgresMaxIdentifier-len(tag)-1] + "_" + tag
}

// NewTest creates a connection to this test binary's own database (see
// TestDSN). Tests are expected to run migrations or cleanup steps as needed
// after obtaining the handle.
func NewTest() (*Database, error) {
	dsn, err := TestDSN()
	if err != nil {
		return nil, err
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

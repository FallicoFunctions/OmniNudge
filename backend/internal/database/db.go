package database

import (
	"context"
	"fmt"
	"math"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	zlog "github.com/rs/zerolog/log"
)

// DB wraps the PostgreSQL connection pool. It is safe for concurrent use;
// the connection pool itself handles multiplexing. The test advisory lock
// helpers (acquireTestLock / releaseTestLock) are guarded by testLockMu.
type DB struct {
	Pool         *pgxpool.Pool
	closeOnce    sync.Once
	testLockMu   sync.Mutex
	testLockKey  *int64
	testLockConn *pgxpool.Conn
}

// poolIntEnv reads an env var as a positive integer, returning defaultVal on
// missing or invalid input.
func poolIntEnv(key string, defaultVal int32) int32 {
	s := os.Getenv(key)
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil || v <= 0 || v > math.MaxInt32 {
		zlog.Warn().
			Str("key", key).
			Str("value", s).
			Int("default", int(defaultVal)).
			Msg("database: invalid pool size env var; using default")
		return defaultVal
	}
	return int32(v)
}

// New creates a new database connection pool
func New(databaseURL string) (*DB, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	// Configure connection pool settings.
	// DB_MAX_CONNS and DB_MIN_CONNS env vars override the compiled-in defaults.
	// Budget note: set DB_MAX_CONNS so that all application instances combined
	// stay below Postgres max_connections (typically 100). For example: with 2
	// replicas and a Postgres max of 100, set DB_MAX_CONNS=45 (leaving 10 for
	// admin/monitoring connections).
	maxConns := poolIntEnv("DB_MAX_CONNS", 50)
	minConns := poolIntEnv("DB_MIN_CONNS", 10)
	if minConns > maxConns {
		zlog.Warn().
			Int("min_conns", int(minConns)).
			Int("max_conns", int(maxConns)).
			Msg("database: DB_MIN_CONNS > DB_MAX_CONNS; clamping min to max")
		minConns = maxConns
	}
	config.MaxConns = maxConns
	config.MinConns = minConns
	config.MaxConnLifetime = 5 * time.Minute
	config.MaxConnIdleTime = 30 * time.Second
	config.HealthCheckPeriod = 1 * time.Minute
	// ConnectTimeout covers TCP dial + TLS handshake + PostgreSQL auth.
	// Configured via DB_CONNECT_TIMEOUT_SECS env var (default 5 s).
	connectTimeoutSecs := poolIntEnv("DB_CONNECT_TIMEOUT_SECS", 5)
	config.ConnConfig.ConnectTimeout = time.Duration(connectTimeoutSecs) * time.Second

	// Wire slow-query analyzer into the pool tracer.
	// Passing nil for logger causes slow-query logs to use slog.Default() at
	// log time, so any default-logger replacement after startup is respected.
	config.ConnConfig.Tracer = NewQueryAnalyzer(100*time.Millisecond, nil)

	// Create connection pool. A 10-second timeout covers TCP dial + TLS + auth.
	// A separate context is used for Ping below; reusing this one after
	// pgxpool.NewWithConfig may leave it with very little budget remaining.
	poolCtx, poolCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer poolCancel()

	pool, err := pgxpool.NewWithConfig(poolCtx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Verify connection with a fresh context so the Ping has the full 5-second
	// budget independent of how long pool creation took.
	pingCtx, pingCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer pingCancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &DB{Pool: pool}, nil
}

// Close closes the database connection pool. Safe to call multiple times;
// subsequent calls are no-ops guaranteed by sync.Once.
func (db *DB) Close() {
	db.closeOnce.Do(func() {
		db.releaseTestLock()
		if db.Pool != nil {
			db.Pool.Close()
		}
	})
}

// Health checks if the database connection is healthy
func (db *DB) Health(ctx context.Context) error {
	return db.Pool.Ping(ctx)
}

// acquireTestLock grabs a process-wide advisory lock so different test packages
// don't truncate each other's tables concurrently.
// The 30-second timeout is intentional: pg_advisory_lock blocks until the lock
// is granted. Under normal test conditions, the wait is sub-second. 30 seconds
// provides a safety margin against a hung test process that holds the lock.
func (db *DB) acquireTestLock(key int64) error {
	db.testLockMu.Lock()
	defer db.testLockMu.Unlock()

	if db.testLockConn != nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	conn, err := db.Pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire test lock connection: %w", err)
	}

	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", key); err != nil {
		conn.Release()
		return err
	}

	db.testLockConn = conn
	// Copy key to heap so the pointer outlives this stack frame.
	k := key
	db.testLockKey = &k
	return nil
}

func (db *DB) releaseTestLock() {
	db.testLockMu.Lock()
	defer db.testLockMu.Unlock()

	if db.testLockConn == nil || db.testLockKey == nil {
		return
	}

	_, _ = db.testLockConn.Exec(context.Background(), "SELECT pg_advisory_unlock($1)", *db.testLockKey)
	db.testLockConn.Release()
	db.testLockConn = nil
	db.testLockKey = nil
}

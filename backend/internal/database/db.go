package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps the PostgreSQL connection pool
type DB struct {
	Pool         *pgxpool.Pool
	testLockKey  *int64
	testLockConn *pgxpool.Conn
}

// New creates a new database connection pool
func New(databaseURL string) (*DB, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	// Configure connection pool settings
	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = 5 * time.Minute
	config.MaxConnIdleTime = 1 * time.Minute

	// Create connection pool with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &DB{Pool: pool}, nil
}

// Close closes the database connection pool
func (db *DB) Close() {
	if db.Pool != nil {
		db.releaseTestLock()
		db.Pool.Close()
	}
}

// Health checks if the database connection is healthy
func (db *DB) Health(ctx context.Context) error {
	return db.Pool.Ping(ctx)
}

// acquireTestLock grabs a process-wide advisory lock so different test packages
// don't truncate each other's tables concurrently.
func (db *DB) acquireTestLock(key int64) error {
	if db.testLockConn != nil {
		return nil
	}

	conn, err := db.Pool.Acquire(context.Background())
	if err != nil {
		return err
	}

	if _, err := conn.Exec(context.Background(), "SELECT pg_advisory_lock($1)", key); err != nil {
		conn.Release()
		return err
	}

	db.testLockConn = conn
	db.testLockKey = &key
	return nil
}

func (db *DB) releaseTestLock() {
	if db.testLockConn == nil || db.testLockKey == nil {
		return
	}

	_, _ = db.testLockConn.Exec(context.Background(), "SELECT pg_advisory_unlock($1)", *db.testLockKey)
	db.testLockConn.Release()
	db.testLockConn = nil
	db.testLockKey = nil
}

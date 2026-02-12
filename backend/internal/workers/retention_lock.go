package workers

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// retentionAdvisoryLockKey is the fixed PostgreSQL advisory lock key used to
// ensure only one retention job runs at a time across all server instances.
// Must be unique within the application. Do not reuse this value for other locks.
const retentionAdvisoryLockKey = int64(7345098120)

// RetentionLock holds a dedicated pool connection that holds the advisory lock.
// The lock is session-scoped: it is held as long as this connection is open.
type RetentionLock struct {
	conn *pgxpool.Conn
}

// AcquireRetentionLock attempts to acquire a PostgreSQL advisory lock using a
// dedicated connection from the pool. This prevents concurrent retention runs
// across multiple server instances.
//
// Returns:
//   - (lock, true, nil)   — lock acquired, proceed with the job
//   - (nil, false, nil)   — another process holds the lock, skip this run
//   - (nil, false, err)   — connection or query error
func AcquireRetentionLock(ctx context.Context, pool *pgxpool.Pool) (*RetentionLock, bool, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("retention lock: failed to acquire pool connection: %w", err)
	}

	var ok bool
	if err := conn.QueryRow(ctx, "SELECT pg_try_advisory_lock($1)", retentionAdvisoryLockKey).Scan(&ok); err != nil {
		conn.Release()
		return nil, false, fmt.Errorf("retention lock: advisory lock query failed: %w", err)
	}

	if !ok {
		conn.Release()
		log.Println("[RETENTION] Advisory lock held by another process — skipping this run")
		return nil, false, nil
	}

	log.Println("[RETENTION] Advisory lock acquired")
	return &RetentionLock{conn: conn}, true, nil
}

// Release unlocks the advisory lock and returns the connection to the pool.
// Safe to call multiple times or on a nil lock.
//
// Uses a fresh context for the unlock query because the caller's ctx may already
// be cancelled (e.g. server shutdown). The advisory lock must always be released
// regardless of the caller's cancellation state.
func (l *RetentionLock) Release(_ context.Context) {
	if l == nil || l.conn == nil {
		return
	}
	releaseCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := l.conn.Exec(releaseCtx, "SELECT pg_advisory_unlock($1)", retentionAdvisoryLockKey); err != nil {
		log.Printf("[RETENTION] Warning: failed to release advisory lock: %v", err)
	}
	l.conn.Release()
	l.conn = nil
	log.Println("[RETENTION] Advisory lock released")
}

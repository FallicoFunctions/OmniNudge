package jobs_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/jobs"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seedFailedLogin inserts a single row into failed_login_attempts at a
// specific age so we can verify the cleanup job's DELETE logic.
// It uses make_interval(secs => $2) to avoid Go duration string formatting
// issues (the same approach the production job uses).
// Fix 13: age.Seconds() already returns float64 — no int64 conversion needed.
func seedFailedLogin(t *testing.T, db *testutil.TestDatabase, identifier string, age time.Duration) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(),
		`INSERT INTO failed_login_attempts (identifier, attempted_at)
		 VALUES ($1, NOW() - make_interval(secs => $2))`,
		identifier, age.Seconds(),
	)
	require.NoError(t, err)
}

// seedAuditLog inserts a single row into audit_logs at a specific age.
// created_at is writable (NOT a generated column) per migration 090_audit_logs.up.sql
// Fix 13: age.Seconds() already returns float64 — no int64 conversion needed.
func seedAuditLog(t *testing.T, db *testutil.TestDatabase, action string, age time.Duration) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(),
		`INSERT INTO audit_logs (action, created_at)
		 VALUES ($1, NOW() - make_interval(secs => $2))`,
		action, age.Seconds(),
	)
	require.NoError(t, err)
}

// countFailedLogins counts failed_login_attempts rows whose identifier matches
// any value in the provided slice. Uses ANY($1::text[]) to avoid SQL injection.
func countFailedLogins(t *testing.T, db *testutil.TestDatabase, identifiers []string) int {
	t.Helper()
	var n int
	err := db.Pool.QueryRow(context.Background(),
		"SELECT COUNT(*) FROM failed_login_attempts WHERE identifier = ANY($1::text[])",
		identifiers,
	).Scan(&n)
	require.NoError(t, err)
	return n
}

// countAuditRows counts audit_logs rows whose action matches any value in the
// provided slice. Uses ANY($1::text[]) to avoid SQL injection.
func countAuditRows(t *testing.T, db *testutil.TestDatabase, actions []string) int {
	t.Helper()
	var n int
	err := db.Pool.QueryRow(context.Background(),
		"SELECT COUNT(*) FROM audit_logs WHERE action = ANY($1::text[])",
		actions,
	).Scan(&n)
	require.NoError(t, err)
	return n
}

func TestNewCleanupJob(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	job := jobs.NewCleanupJob(db.Pool)
	assert.NotNil(t, job)
}

// TestCleanupJob_Start_ContextCancellation verifies that Start() returns when
// the context is cancelled (i.e., it does not block forever).
func TestCleanupJob_Start_ContextCancellation(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	job := jobs.NewCleanupJob(db.Pool)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	done := make(chan struct{})
	go func() {
		job.Start(ctx)
		close(done)
	}()

	select {
	case <-done:
		// Good — Start() returned after context cancellation.
	case <-time.After(2 * time.Second):
		t.Fatal("CleanupJob.Start did not return after context cancellation")
	}
}

// TestCleanupJob_PurgesExpiredFailedLogins seeds stale and recent rows and
// confirms that only stale ones are deleted after calling PurgeFailedLogins.
// Fix 22: identifiers include a nanosecond timestamp to prevent cross-test
// collisions when the shared test database is used.
func TestCleanupJob_PurgesExpiredFailedLogins(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	job := jobs.NewCleanupJob(db.Pool)
	ctx := context.Background()

	// Generate unique identifiers to avoid cross-test interference.
	ns := time.Now().UnixNano()
	stale1 := fmt.Sprintf("stale_1_%d", ns)
	stale2 := fmt.Sprintf("stale_2_%d", ns)
	recent := fmt.Sprintf("recent_%d", ns)

	// Seed: 2 old rows (>24h) and 1 recent row.
	seedFailedLogin(t, db, stale1, 25*time.Hour)
	seedFailedLogin(t, db, stale2, 30*time.Hour)
	seedFailedLogin(t, db, recent, 5*time.Minute)

	// Call the exported purge method directly — no SQL duplication in the test.
	job.PurgeFailedLogins(ctx)

	remaining := countFailedLogins(t, db, []string{stale1, stale2, recent})
	assert.Equal(t, 1, remaining, "only the recent row should survive the purge")
}

// TestCleanupJob_PurgesExpiredAuditLogs verifies that old audit_logs rows are
// removed while recent ones are preserved.
// Fix 22: actions include a nanosecond timestamp to prevent cross-test
// collisions when the shared test database is used.
// TestCleanupJob_Start_ImmediatelyPurgesOnStartup verifies that Start() runs
// PurgeFailedLogins on startup (before the first ticker fires). It uses a
// very long tick interval so the ticker never fires during the test.
func TestCleanupJob_Start_ImmediatelyPurgesOnStartup(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	// Use a very long tick interval so the ticker never fires during the test.
	job := jobs.NewCleanupJob(db.Pool, jobs.WithFailedLoginInterval(24*time.Hour))

	ns := fmt.Sprintf("%d", time.Now().UnixNano())
	staleID := "startup_purge_" + ns

	// Seed one stale row (25h old).
	seedFailedLogin(t, db, staleID, 25*time.Hour)

	// Verify it exists before Start.
	before := countFailedLogins(t, db, []string{staleID})
	require.Equal(t, 1, before, "stale row should exist before Start")

	// Run Start with a short-lived context (cancels after 200ms).
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	job.Start(ctx) // blocks until ctx is done

	// After Start returns, the stale row should be gone.
	after := countFailedLogins(t, db, []string{staleID})
	assert.Equal(t, 0, after, "stale row should be deleted by startup purge")
}

func TestCleanupJob_PurgesExpiredAuditLogs(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	job := jobs.NewCleanupJob(db.Pool)
	ctx := context.Background()

	// Generate unique actions to avoid cross-test interference.
	ns := time.Now().UnixNano()
	oldAction := fmt.Sprintf("old_action_%d", ns)
	newAction := fmt.Sprintf("new_action_%d", ns)

	// Seed: 1 old row (>90 days) and 1 recent row.
	// created_at is writable (NOT a generated column) per migration 090_audit_logs.up.sql
	seedAuditLog(t, db, oldAction, 91*24*time.Hour)
	seedAuditLog(t, db, newAction, 1*time.Hour)

	// Call the exported purge method directly.
	job.PurgeAuditLogs(ctx)

	remaining := countAuditRows(t, db, []string{oldAction, newAction})
	assert.Equal(t, 1, remaining, "only the recent audit log should survive the purge")
}

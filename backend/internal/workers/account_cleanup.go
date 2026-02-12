package workers

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/services"
)

// AccountCleanupWorker permanently deletes user accounts that have passed
// their grace period. It runs daily at 3 AM and processes up to 100 accounts
// per run to bound execution time.
//
// The advisory lock (shared with RetentionWorker) ensures only one cleanup job
// runs at a time across all server instances.
type AccountCleanupWorker struct {
	db       *pgxpool.Pool
	scrubber *services.ScrubberService
	storage  services.StorageService
}

// NewAccountCleanupWorker creates a new AccountCleanupWorker.
func NewAccountCleanupWorker(db *pgxpool.Pool, scrubber *services.ScrubberService, storage services.StorageService) *AccountCleanupWorker {
	return &AccountCleanupWorker{
		db:       db,
		scrubber: scrubber,
		storage:  storage,
	}
}

// Start waits until 3 AM and then runs the cleanup daily.
// Blocks until ctx is cancelled.
func (w *AccountCleanupWorker) Start(ctx context.Context) {
	now := time.Now()
	next3AM := time.Date(now.Year(), now.Month(), now.Day(), 3, 0, 0, 0, now.Location())
	if now.After(next3AM) {
		next3AM = next3AM.Add(24 * time.Hour)
	}
	initialDelay := time.Until(next3AM)
	log.Printf("[ACCOUNT-CLEANUP] First run in %v (at %v)", initialDelay, next3AM)

	select {
	case <-time.After(initialDelay):
		w.runCleanup(ctx)
	case <-ctx.Done():
		return
	}

	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			w.runCleanup(ctx)
		case <-ctx.Done():
			log.Println("[ACCOUNT-CLEANUP] Shutting down")
			return
		}
	}
}

func (w *AccountCleanupWorker) runCleanup(ctx context.Context) {
	lock, ok, err := AcquireRetentionLock(ctx, w.db)
	if err != nil {
		log.Printf("[ACCOUNT-CLEANUP] Lock error: %v", err)
		return
	}
	if !ok {
		log.Println("[ACCOUNT-CLEANUP] Skipping run: another retention job is running")
		return
	}
	defer lock.Release(ctx)

	log.Println("[ACCOUNT-CLEANUP] Starting permanent account deletion cycle")

	rows, err := w.db.Query(ctx, `
		SELECT id, username
		FROM users
		WHERE deleted_at IS NOT NULL
		  AND permanent_deletion_at IS NOT NULL
		  AND permanent_deletion_at < NOW()
		LIMIT 100
	`)
	if err != nil {
		log.Printf("[ACCOUNT-CLEANUP] Failed to query pending deletions: %v", err)
		return
	}

	type pendingUser struct {
		id       int
		username string
	}
	var pending []pendingUser
	for rows.Next() {
		var u pendingUser
		if err := rows.Scan(&u.id, &u.username); err != nil {
			log.Printf("[ACCOUNT-CLEANUP] Failed to scan row: %v", err)
			continue
		}
		pending = append(pending, u)
	}
	rows.Close()

	deleted := 0
	for _, u := range pending {
		if err := w.scrubber.ScrubUser(ctx, u.id); err != nil {
			log.Printf("[ACCOUNT-CLEANUP] Failed to permanently delete user %d (%s): %v", u.id, u.username, err)
			continue
		}
		// Note: do NOT insert into account_deletion_log here.
		// The log entry was created when the user requested deletion.
		// ScrubUser will delete it as part of full data erasure (GDPR compliance).
		log.Printf("[ACCOUNT-CLEANUP] Permanently deleted user %d (%s)", u.id, u.username)
		deleted++
	}

	log.Printf("[ACCOUNT-CLEANUP] Cycle complete: %d/%d accounts permanently deleted", deleted, len(pending))
}

package workers

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/services"
)

// AccountCleanupWorker permanently deletes accounts after grace period
type AccountCleanupWorker struct {
	db       *pgxpool.Pool
	scrubber *services.ScrubberService
	storage  services.StorageService
}

func NewAccountCleanupWorker(db *pgxpool.Pool, scrubber *services.ScrubberService, storage services.StorageService) *AccountCleanupWorker {
	return &AccountCleanupWorker{
		db:       db,
		scrubber: scrubber,
		storage:  storage,
	}
}

// Start runs the cleanup worker (call once at startup)
func (w *AccountCleanupWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour) // Run once per day
	defer ticker.Stop()

	// Run immediately on startup
	w.cleanupExpiredAccounts(ctx)
	w.cleanupExpiredExports(ctx)

	for {
		select {
		case <-ticker.C:
			w.cleanupExpiredAccounts(ctx)
			w.cleanupExpiredExports(ctx)
		case <-ctx.Done():
			log.Println("Account cleanup worker stopped")
			return
		}
	}
}

func (w *AccountCleanupWorker) cleanupExpiredExports(ctx context.Context) {
	log.Println("[CLEANUP] Starting expired export cleanup")

	// Find expired exports in DB
	rows, err := w.db.Query(ctx, `
		SELECT export_id, user_id FROM data_export_requests
		WHERE status = 'completed' AND expires_at < NOW()
	`)
	if err != nil {
		log.Printf("[CLEANUP] Failed to query expired exports: %v", err)
	} else {
		defer rows.Close()
		for rows.Next() {
			var exportID string
			var userID int
			if err := rows.Scan(&exportID, &userID); err == nil {
				// Delete from storage
				storageKey := fmt.Sprintf("exports/%d/%s.zip", userID, exportID)
				if err := w.storage.Delete(ctx, storageKey); err != nil {
					log.Printf("[CLEANUP] Warning: failed to delete expired export file %s: %v", storageKey, err)
				} else {
					log.Printf("[CLEANUP] Deleted expired export file: %s", storageKey)
				}
			}
		}
	}

	// Also purge old session keys just in case
	_, _ = w.db.Exec(ctx, "DELETE FROM export_session_keys WHERE expires_at < NOW()")
}

func (w *AccountCleanupWorker) cleanupExpiredAccounts(ctx context.Context) {
	log.Println("[CLEANUP] Starting account deletion cleanup")

	// Find accounts past grace period
	rows, err := w.db.Query(ctx, `
		SELECT id, username, email, deleted_at, permanent_deletion_at
		FROM users
		WHERE deleted_at IS NOT NULL
		  AND permanent_deletion_at IS NOT NULL
		  AND permanent_deletion_at < NOW()
		LIMIT 100
	`)
	if err != nil {
		log.Printf("[CLEANUP] Failed to query expired accounts: %v", err)
		return
	}
	defer rows.Close()

	deletedCount := 0
	for rows.Next() {
		var userID int
		var username, email string
		var deletedAt, permanentDeletionAt time.Time

		if err := rows.Scan(&userID, &username, &email, &deletedAt, &permanentDeletionAt); err != nil {
			log.Printf("[CLEANUP] Failed to scan row: %v", err)
			continue
		}

		// Permanently delete account
		if err := w.permanentlyDeleteAccount(ctx, userID); err != nil {
			log.Printf("[CLEANUP] Failed to delete account %d (%s): %v", userID, username, err)
			continue
		}

		log.Printf("[CLEANUP] Permanently deleted account %d (%s, %s)", userID, username, email)
		deletedCount++
	}

	log.Printf("[CLEANUP] Finished account deletion cleanup: %d accounts deleted", deletedCount)
}

func (w *AccountCleanupWorker) permanentlyDeleteAccount(ctx context.Context, userID int) error {
	// Use the central ScrubberService for irreversible deletion
	if err := w.scrubber.ScrubUser(ctx, userID); err != nil {
		return fmt.Errorf("scrubber failed: %w", err)
	}

	// Log permanent deletion (Scrubber might already do this, but keeping it for audit)
	_, err := w.db.Exec(ctx, `
		INSERT INTO account_deletion_log (user_id, requested_at, reason)
		VALUES ($1, NOW(), 'permanently_deleted')
	`, userID)
	if err != nil {
		log.Printf("[CLEANUP] Warning: Failed to log permanent deletion for user %d: %v", userID, err)
	}

	return nil
}

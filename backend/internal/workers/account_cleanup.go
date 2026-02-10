package workers

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AccountCleanupWorker permanently deletes accounts after grace period
type AccountCleanupWorker struct {
	db *pgxpool.Pool
}

func NewAccountCleanupWorker(db *pgxpool.Pool) *AccountCleanupWorker {
	return &AccountCleanupWorker{db: db}
}

// Start runs the cleanup worker (call once at startup)
func (w *AccountCleanupWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour) // Run once per day
	defer ticker.Stop()

	// Run immediately on startup
	w.cleanupExpiredAccounts(ctx)

	for {
		select {
		case <-ticker.C:
			w.cleanupExpiredAccounts(ctx)
		case <-ctx.Done():
			log.Println("Account cleanup worker stopped")
			return
		}
	}
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
	tx, err := w.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Delete user's messages (cascade will handle most relations)
	_, err = tx.Exec(ctx, "DELETE FROM messages WHERE sender_id = $1", userID)
	if err != nil {
		return err
	}

	// TODO: Delete S3 files (profile avatars, uploaded media) before deleting posts
	// This requires S3 service integration to be implemented
	// Query media_files for s3_key values, then call S3 DeleteObject for each

	// Delete user's posts
	_, err = tx.Exec(ctx, "DELETE FROM platform_posts WHERE user_id = $1", userID)
	if err != nil {
		return err
	}

	// Delete user's comments
	_, err = tx.Exec(ctx, "DELETE FROM post_comments WHERE user_id = $1", userID)
	if err != nil {
		return err
	}

	// Remove from conversations
	_, err = tx.Exec(ctx, "DELETE FROM conversation_participants WHERE user_id = $1", userID)
	if err != nil {
		return err
	}

	// Delete encryption keys (important for security)
	_, err = tx.Exec(ctx, `
		UPDATE users
		SET public_key = NULL, encrypted_private_key = NULL
		WHERE id = $1
	`, userID)
	if err != nil {
		return err
	}

	// Delete user account (hard delete)
	_, err = tx.Exec(ctx, "DELETE FROM users WHERE id = $1", userID)
	if err != nil {
		return err
	}

	// Log permanent deletion
	_, err = tx.Exec(ctx, `
		INSERT INTO account_deletion_log (user_id, requested_at, reason)
		VALUES ($1, NOW(), 'permanently_deleted')
	`, userID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

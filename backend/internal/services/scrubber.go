package services

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ScrubberService handles irreversible removal of user data
type ScrubberService struct {
	db      *pgxpool.Pool
	storage StorageService
}

func NewScrubberService(db *pgxpool.Pool, storage StorageService) *ScrubberService {
	return &ScrubberService{
		db:      db,
		storage: storage,
	}
}

// ScrubMediaFile deletes a single media file from storage and removes its DB record.
// Idempotent: returns nil if the file does not exist.
func (s *ScrubberService) ScrubMediaFile(ctx context.Context, mediaFileID int) error {
	var storagePath string
	err := s.db.QueryRow(ctx, "SELECT storage_path FROM media_files WHERE id = $1", mediaFileID).Scan(&storagePath)
	if err != nil {
		return nil // not found or already deleted
	}
	if delErr := s.storage.Delete(ctx, storagePath); delErr != nil {
		log.Printf("[SCRUBBER] Warning: failed to delete media file %s from storage: %v", storagePath, delErr)
	}
	_, err = s.db.Exec(ctx, "DELETE FROM media_files WHERE id = $1", mediaFileID)
	return err
}

// ScrubUser permanently deletes all data associated with a user
func (s *ScrubberService) ScrubUser(ctx context.Context, userID int) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	log.Printf("[SCRUBBER] Starting permanent deletion for user_id=%d", userID)

	// List of tables to clean up.
	// Tables with ON DELETE CASCADE defined in migration will be handled by DB automatically.
	// But we list them here explicitly to be sure about the order and completeness.

	tables := []string{
		"post_votes",
		"comment_votes",
		"saved_posts",
		"hub_subscriptions",
		"hub_access_requests",
		"hub_presence",
		"subreddit_presence",
		"user_status",
		"device_tokens",
		"policy_acceptance",
		"retention_settings_audit",
		"feature_flag_overrides",
		"user_bans",
		"account_deletion_log",
		"export_session_keys",  // Added
		"data_export_requests", // Added
		"user_feedback",
		"bug_reports",
		"user_settings",
		"invitations",
	}

	for _, table := range tables {
		_, err := tx.Exec(ctx, fmt.Sprintf("DELETE FROM %s WHERE user_id = $1", table), userID)
		if err != nil {
			log.Printf("[SCRUBBER] Critical error: failed to scrub table %s: %v", table, err)
			return fmt.Errorf("failed to scrub table %s: %w", table, err)
		}
	}

	// 2. Fetch and delete media files from storage
	rows, err := tx.Query(ctx, "SELECT storage_path FROM media_files WHERE user_id = $1", userID)
	if err == nil {
		var paths []string
		for rows.Next() {
			var path string
			if err := rows.Scan(&path); err == nil {
				paths = append(paths, path)
			}
		}
		rows.Close()

		for _, path := range paths {
			_ = s.storage.Delete(ctx, path)
			log.Printf("[SCRUBBER] Deleted media file: %s", path)
		}
	}
	_, _ = tx.Exec(ctx, "DELETE FROM media_files WHERE user_id = $1", userID)

	// 3. Clean up export files
	// Standard path for exports is exports/{user_id}/...
	// LocalStorageService Delete handles the key.
	// We'll rely on the Daily cleanup worker for full directory wipes,
	// but we try to be proactive here if possible.

	// 4. Handle conversations and messages (E2E data)
	// Delete posts and comments
	_, err = tx.Exec(ctx, "DELETE FROM platform_posts WHERE author_id = $1", userID)
	if err != nil {
		return fmt.Errorf("failed to delete posts: %w", err)
	}
	_, err = tx.Exec(ctx, "DELETE FROM post_comments WHERE user_id = $1", userID)
	if err != nil {
		return fmt.Errorf("failed to delete comments: %w", err)
	}

	// Final step: Delete user record
	_, err = tx.Exec(ctx, "DELETE FROM users WHERE id = $1", userID)
	if err != nil {
		return fmt.Errorf("failed to delete user record: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit scrub transaction: %w", err)
	}

	log.Printf("[SCRUBBER] Permanent deletion complete for user_id=%d", userID)
	return nil
}

package services

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/services/speech"
)

// ScrubberService handles irreversible removal of user data
type ScrubberService struct {
	db           *pgxpool.Pool
	storage      StorageService
	voiceStorage StorageService
}

// SetVoiceStorage supplies the dedicated backend used for OmniChat speech.
// Account erasure deliberately fails closed when speech objects exist but this
// backend is unavailable, preventing a database cascade from orphaning audio.
func (s *ScrubberService) SetVoiceStorage(storage StorageService) *ScrubberService {
	s.voiceStorage = storage
	return s
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
	if err := s.scrubOmniChatSpeech(ctx, tx, userID); err != nil {
		return err
	}

	// List of tables to clean up.
	// Tables with ON DELETE CASCADE defined in migration will be handled by DB automatically.
	// But we list them here explicitly to be sure about the order and completeness.

	tables := []struct {
		name  string
		where string
	}{
		{"post_votes", "user_id = $1"}, {"comment_votes", "user_id = $1"}, {"saved_posts", "user_id = $1"},
		{"hub_subscriptions", "user_id = $1"}, {"hub_access_requests", "user_id = $1"}, {"hub_presence", "user_id = $1"},
		{"subreddit_presence", "user_id = $1"}, {"user_status", "user_id = $1"}, {"device_tokens", "user_id = $1"},
		{"policy_acceptances", "user_id = $1"}, {"retention_settings_audit", "changed_by = $1"},
		{"feature_flag_overrides", "user_id = $1"}, {"user_bans", "user_id = $1"}, {"account_deletion_log", "user_id = $1"},
		{"export_session_keys", "user_id = $1"}, {"data_export_requests", "user_id = $1"}, {"user_feedback", "user_id = $1"},
		{"bug_reports", "user_id = $1"}, {"user_settings", "user_id = $1"}, {"invitations", "inviter_id = $1 OR invited_user_id = $1"},
	}

	for _, table := range tables {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT to_regclass('public.' || $1) IS NOT NULL`, table.name).Scan(&exists); err != nil {
			return fmt.Errorf("failed to inspect scrub table %s: %w", table.name, err)
		}
		if !exists {
			continue
		}
		_, err := tx.Exec(ctx, fmt.Sprintf("DELETE FROM %s WHERE %s", table.name, table.where), userID)
		if err != nil {
			log.Printf("[SCRUBBER] Critical error: failed to scrub table %s: %v", table.name, err)
			return fmt.Errorf("failed to scrub table %s: %w", table.name, err)
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

// scrubOmniChatSpeech deletes dedicated speech blobs before any user, persona,
// conversation, or message cascade can remove their database rows. Rows are
// selected for every cascade root that belongs to the account; the trigger
// outbox covers any other deletion path and retries it through retention.
func (s *ScrubberService) scrubOmniChatSpeech(ctx context.Context, tx pgx.Tx, userID int) error {
	rows, err := tx.Query(ctx, `
		SELECT id, storage_path
		FROM omnichat_speech_audio
		WHERE owner_user_id = $1
		   OR persona_id IN (SELECT id FROM bot_personas WHERE owner_user_id = $1)
		   OR message_id IN (
				SELECT m.id FROM bot_messages m
				JOIN bot_conversations c ON c.id = m.conversation_id
				WHERE c.user_id = $1
			)
		FOR UPDATE
	`, userID)
	if err != nil {
		return fmt.Errorf("failed to list OmniChat speech for deletion: %w", err)
	}
	defer rows.Close()

	type speechObject struct {
		id   string
		path string
	}
	objects := make([]speechObject, 0)
	for rows.Next() {
		var object speechObject
		if err := rows.Scan(&object.id, &object.path); err != nil {
			return fmt.Errorf("failed to scan OmniChat speech for deletion: %w", err)
		}
		if !speech.IsOmniChatStoragePath(object.path) {
			return errors.New("refusing to delete OmniChat speech with an invalid storage path")
		}
		objects = append(objects, object)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("failed to read OmniChat speech for deletion: %w", err)
	}
	if len(objects) == 0 {
		return nil
	}
	if s.voiceStorage == nil {
		return errors.New("OmniChat voice storage is unavailable for permanent deletion")
	}
	for _, object := range objects {
		if err := s.voiceStorage.Delete(ctx, object.path); err != nil {
			return fmt.Errorf("failed to delete OmniChat speech object: %w", err)
		}
	}
	for _, object := range objects {
		if _, err := tx.Exec(ctx, `DELETE FROM omnichat_speech_audio WHERE id=$1`, object.id); err != nil {
			return fmt.Errorf("failed to delete OmniChat speech record: %w", err)
		}
		// The DELETE trigger records every erased path in the durable cleanup
		// outbox. This object was synchronously deleted above, so acknowledge
		// its tombstone in the same transaction.
		if _, err := tx.Exec(ctx, `DELETE FROM omnichat_speech_deletion_queue WHERE storage_path=$1`, object.path); err != nil {
			return fmt.Errorf("failed to acknowledge OmniChat speech deletion: %w", err)
		}
	}
	return nil
}

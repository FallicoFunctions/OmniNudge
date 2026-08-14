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

// SetVoiceStorage is retained for constructor compatibility. Speech deletion
// is now committed to a durable database outbox and drained after commit.
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

// ScrubMediaFile removes the database record. Its DELETE trigger commits the
// storage key to a durable outbox in the same transaction; retention deletes
// the object only after this method succeeds.
func (s *ScrubberService) ScrubMediaFile(ctx context.Context, mediaFileID int) error {
	_, err := s.db.Exec(ctx, "DELETE FROM media_files WHERE id = $1", mediaFileID)
	return err
}

// ScrubUser permanently deletes all data associated with a user
func (s *ScrubberService) ScrubUser(ctx context.Context, userID int) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

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

	// 2. Delete media rows transactionally. Database triggers queue every
	// backing object for post-commit deletion, so a later rollback cannot
	// restore a row whose blob has already been destroyed.
	if _, err = tx.Exec(ctx, "DELETE FROM media_files WHERE user_id = $1", userID); err != nil {
		return fmt.Errorf("failed to queue user media deletion: %w", err)
	}

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

// scrubOmniChatSpeech validates dedicated speech keys and removes their rows.
// The speech DELETE trigger records the objects transactionally; retention
// performs the irreversible storage deletion after commit.
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

	ids := make([]string, 0)
	for rows.Next() {
		var id, storagePath string
		if err := rows.Scan(&id, &storagePath); err != nil {
			return fmt.Errorf("failed to scan OmniChat speech for deletion: %w", err)
		}
		if !speech.IsOmniChatStoragePath(storagePath) {
			return errors.New("refusing to delete OmniChat speech with an invalid storage path")
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("failed to read OmniChat speech for deletion: %w", err)
	}
	if len(ids) == 0 {
		return nil
	}
	for _, id := range ids {
		if _, err := tx.Exec(ctx, `DELETE FROM omnichat_speech_audio WHERE id=$1`, id); err != nil {
			return fmt.Errorf("failed to delete OmniChat speech record: %w", err)
		}
	}
	return nil
}

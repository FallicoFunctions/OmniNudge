package workers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/speech"
)

// RetentionWorker runs daily data cleanup jobs: message deletion, export expiry,
// notification purge, archive cleanup, and analytics anonymization.
//
// Account deletion is handled separately by AccountCleanupWorker.
// The advisory lock (shared with AccountCleanupWorker) ensures only one job
// runs at a time across all server instances.
type RetentionWorker struct {
	db            *pgxpool.Pool
	scrubber      *services.ScrubberService
	storage       services.StorageService
	voiceStorage  services.StorageService
	liveCallEnder interface {
		EndConversation(context.Context, string) error
	}
	cfg config.RetentionConfig
}

// SetVoiceStorage supplies the storage backend used for synthesized OmniChat
// speech. Local deployments keep it in a dedicated directory; S3 deployments
// can pass the same backend used for other media.
func (w *RetentionWorker) SetVoiceStorage(storage services.StorageService) *RetentionWorker {
	w.voiceStorage = storage
	return w
}

// SetLiveCallEnder supplies the provider client used to reclaim Tavus rooms
// after a client disconnect or a transient endpoint cleanup failure.
func (w *RetentionWorker) SetLiveCallEnder(ender interface {
	EndConversation(context.Context, string) error
}) *RetentionWorker {
	w.liveCallEnder = ender
	return w
}

// NewRetentionWorker creates a new RetentionWorker.
func NewRetentionWorker(db *pgxpool.Pool, scrubber *services.ScrubberService, storage services.StorageService, cfg config.RetentionConfig) *RetentionWorker {
	return &RetentionWorker{
		db:       db,
		scrubber: scrubber,
		storage:  storage,
		cfg:      cfg,
	}
}

// Start waits until 2 AM then runs daily. Blocks until ctx is cancelled.
// Does NOT run immediately on startup — first run is at the scheduled time.
func (w *RetentionWorker) Start(ctx context.Context) {
	now := time.Now()
	next2AM := time.Date(now.Year(), now.Month(), now.Day(), 2, 0, 0, 0, now.Location())
	if now.After(next2AM) {
		next2AM = next2AM.Add(24 * time.Hour)
	}
	initialDelay := time.Until(next2AM)
	log.Printf("[RETENTION] First run in %v (at %v)", initialDelay, next2AM)

	select {
	case <-time.After(initialDelay):
		w.runAllJobs(ctx)
	case <-ctx.Done():
		return
	}

	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			w.runAllJobs(ctx)
		case <-ctx.Done():
			log.Println("[RETENTION] Shutting down")
			return
		}
	}
}

func (w *RetentionWorker) runAllJobs(ctx context.Context) {
	lock, ok, err := AcquireRetentionLock(ctx, w.db)
	if err != nil {
		log.Printf("[RETENTION] Lock error: %v", err)
		return
	}
	if !ok {
		log.Println("[RETENTION] Skipping run: another retention job is running")
		return
	}
	defer lock.Release(ctx)

	log.Printf("[RETENTION] Starting daily cleanup jobs (DryRun=%v)", w.cfg.DryRun)

	w.cleanupExpiredExports(ctx)
	w.cleanupExpiredAuthSessions(ctx)
	w.cleanupExpiredAuthTokens(ctx)
	w.cleanupExpiredDirectUploads(ctx)
	w.cleanupDeletedOmniChatSpeech(ctx)
	w.cleanupExpiredOmniChatSpeech(ctx)
	w.cleanupAbandonedOmniChatCalls(ctx)
	w.cleanupExpiredMessages(ctx)
	w.cleanupCallLogs(ctx)
	w.cleanupExpiredNotifications(ctx)
	w.cleanupExpiredArchives(ctx)
	w.anonymizeAnalytics(ctx)

	log.Println("[RETENTION] All daily cleanup jobs finished")
}

func (w *RetentionWorker) cleanupExpiredAuthTokens(ctx context.Context) {
	if w.db == nil || w.cfg.DryRun {
		return
	}
	if _, err := w.db.Exec(ctx, `
		DELETE FROM email_verifications
		WHERE expires_at < NOW() - INTERVAL '7 days'
	`); err != nil && !isUndefinedTableError(err) {
		log.Printf("[RETENTION] Failed to clean expired email verification tokens: %v", err)
	}
	if _, err := w.db.Exec(ctx, `
		DELETE FROM password_resets
		WHERE expires_at < NOW() - INTERVAL '7 days'
	`); err != nil && !isUndefinedTableError(err) {
		log.Printf("[RETENTION] Failed to clean expired password reset tokens: %v", err)
	}
}

func (w *RetentionWorker) cleanupExpiredAuthSessions(ctx context.Context) {
	if w.db == nil {
		return
	}
	if w.cfg.DryRun {
		return
	}
	if _, err := w.db.Exec(ctx, `
		DELETE FROM auth_sessions
		WHERE expires_at < NOW() - INTERVAL '7 days'
		   OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days')
	`); err != nil && !isUndefinedTableError(err) {
		log.Printf("[RETENTION] Failed to clean expired authentication sessions: %v", err)
	}
}

// cleanupExpiredDirectUploads removes objects that were uploaded but never
// confirmed. Database paths are constrained to the dedicated pending prefix so
// a corrupted row cannot turn retention into an arbitrary object deleter.
func (w *RetentionWorker) cleanupExpiredDirectUploads(ctx context.Context) {
	if w.db == nil || w.storage == nil {
		return
	}
	rows, err := w.db.Query(ctx, `
		SELECT i.id, i.user_id, i.storage_path, i.status
		FROM media_upload_intents i
		LEFT JOIN media_files mf ON mf.id=i.confirmed_media_id
		WHERE i.expires_at < NOW()
		  AND (i.status IN ('pending','failed')
		       OR (i.status='confirmed' AND mf.scan_status IN ('clean','infected')))
		ORDER BY i.expires_at
		LIMIT 500
	`)
	if err != nil {
		if !isUndefinedTableError(err) {
			log.Printf("[RETENTION] Failed to query expired direct uploads: %v", err)
		}
		return
	}
	type expiredUpload struct {
		id, path, status string
		userID           int
	}
	var uploads []expiredUpload
	for rows.Next() {
		var upload expiredUpload
		if err := rows.Scan(&upload.id, &upload.userID, &upload.path, &upload.status); err != nil {
			rows.Close()
			log.Printf("[RETENTION] Failed to scan expired direct upload: %v", err)
			return
		}
		uploads = append(uploads, upload)
	}
	rows.Close()
	if w.cfg.DryRun {
		if len(uploads) > 0 {
			log.Printf("[RETENTION][DRY-RUN] Would delete %d expired direct uploads", len(uploads))
		}
		return
	}
	for _, upload := range uploads {
		expectedPrefix := fmt.Sprintf("pending-uploads/%d/", upload.userID)
		if !strings.HasPrefix(upload.path, expectedPrefix) {
			log.Printf("[RETENTION] Refusing invalid direct-upload storage path %q", upload.path)
			continue
		}
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		err := w.storage.Delete(cleanupCtx, upload.path)
		if err == nil && upload.status == "pending" {
			_, err = w.db.Exec(cleanupCtx, `
				UPDATE media_upload_intents
				SET status='failed', failure_reason='upload expired before confirmation'
				WHERE id=$1 AND status='pending'
			`, upload.id)
		}
		cancel()
		if err != nil {
			log.Printf("[RETENTION] Failed to clean expired direct upload %s: %v", upload.id, err)
		}
	}
	if _, err := w.db.Exec(ctx, `
		DELETE FROM media_upload_intents
		WHERE (status='failed' AND created_at < NOW()-INTERVAL '30 days')
		   OR (status='confirmed' AND confirmed_at < NOW()-INTERVAL '90 days')
	`); err != nil && !isUndefinedTableError(err) {
		log.Printf("[RETENTION] Failed to prune direct-upload intents: %v", err)
	}
}

// cleanupDeletedOmniChatSpeech drains the durable outbox populated by the
// database DELETE trigger. It covers cascades from users, personas,
// conversations, and messages, where the deleted speech row would otherwise
// no longer contain the storage key needed for cleanup.
func (w *RetentionWorker) cleanupDeletedOmniChatSpeech(ctx context.Context) {
	if w.db == nil || w.voiceStorage == nil {
		return
	}
	const batchSize = 500
	for {
		rows, err := w.db.Query(ctx, `
			SELECT storage_path FROM omnichat_speech_deletion_queue
			ORDER BY created_at, storage_path
			LIMIT $1
		`, batchSize)
		if err != nil {
			if !isUndefinedTableError(err) {
				log.Printf("[RETENTION] Failed to query deleted OmniChat speech: %v", err)
			}
			return
		}
		paths := make([]string, 0, batchSize)
		for rows.Next() {
			var storagePath string
			if err := rows.Scan(&storagePath); err != nil {
				rows.Close()
				log.Printf("[RETENTION] Failed to scan deleted OmniChat speech: %v", err)
				return
			}
			paths = append(paths, storagePath)
		}
		rowsErr := rows.Err()
		rows.Close()
		if rowsErr != nil {
			log.Printf("[RETENTION] Failed while reading deleted OmniChat speech: %v", rowsErr)
			return
		}
		if len(paths) == 0 {
			return
		}
		if w.cfg.DryRun {
			log.Printf("[RETENTION][DRY-RUN] Would delete %d cascaded OmniChat speech files", len(paths))
			return
		}
		acknowledged := 0
		invalidPaths := 0
		for _, storagePath := range paths {
			if !speech.IsOmniChatStoragePath(storagePath) {
				// Retain unsafe tombstones for manual investigation; never let a
				// corrupted database row turn the worker into an arbitrary deleter.
				invalidPaths++
				continue
			}
			cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
			err := w.voiceStorage.Delete(cleanupCtx, storagePath)
			if err == nil {
				_, err = w.db.Exec(cleanupCtx, `DELETE FROM omnichat_speech_deletion_queue WHERE storage_path=$1`, storagePath)
				if err == nil {
					acknowledged++
				}
			}
			cancel()
			if err != nil {
				// Leave the tombstone in place. Storage Delete is idempotent, so a
				// partial success before a database error is safe to retry.
				log.Printf("[RETENTION] Warning: failed to drain OmniChat speech deletion outbox: %v", err)
			}
		}
		if invalidPaths > 0 {
			log.Printf("[RETENTION] Refusing %d invalid OmniChat speech storage paths", invalidPaths)
		}
		if acknowledged == 0 {
			// A full batch of invalid paths or a storage outage would otherwise
			// be selected again immediately and spin forever.
			return
		}
		if len(paths) < batchSize {
			return
		}
	}
}

// cleanupAbandonedOmniChatCalls closes provider sessions that are already
// locally ended or have been active without a heartbeat for two hours. The
// provider id remains in the row after failures so the next retention pass can
// retry; successful cleanup clears it atomically.
func (w *RetentionWorker) cleanupAbandonedOmniChatCalls(ctx context.Context) {
	if w.db == nil || w.liveCallEnder == nil {
		return
	}
	rows, err := w.db.Query(ctx, `
		SELECT id FROM omnichat_call_sessions
		WHERE provider='tavus' AND provider_session_id IS NOT NULL
		  AND (status <> 'active' OR last_activity_at < NOW()-INTERVAL '2 hours')
		ORDER BY last_activity_at
		LIMIT 500
	`)
	if err != nil {
		if !isUndefinedTableError(err) {
			log.Printf("[RETENTION] Failed to query abandoned OmniChat calls: %v", err)
		}
		return
	}
	callIDs := make([]string, 0, 500)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			log.Printf("[RETENTION] Failed to scan abandoned OmniChat call: %v", err)
			return
		}
		callIDs = append(callIDs, id)
	}
	rowsErr := rows.Err()
	rows.Close()
	if rowsErr != nil {
		log.Printf("[RETENTION] Failed while reading abandoned OmniChat calls: %v", rowsErr)
		return
	}
	if len(callIDs) == 0 {
		return
	}
	if w.cfg.DryRun {
		log.Printf("[RETENTION][DRY-RUN] Would end %d abandoned OmniChat provider calls", len(callIDs))
		return
	}
	for _, callID := range callIDs {
		var providerSessionID string
		err := w.db.QueryRow(ctx, `
			UPDATE omnichat_call_sessions
			SET status='ended',ended_at=COALESCE(ended_at,NOW()),
			    last_activity_at=CASE WHEN status='active' THEN NOW() ELSE last_activity_at END
			WHERE id=$1 AND provider='tavus' AND provider_session_id IS NOT NULL
			  AND (status <> 'active' OR last_activity_at < NOW()-INTERVAL '2 hours')
			RETURNING provider_session_id
		`, callID).Scan(&providerSessionID)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			log.Printf("[RETENTION] Warning: failed to claim abandoned OmniChat call %s: %v", callID, err)
			continue
		}
		providerCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		err = w.liveCallEnder.EndConversation(providerCtx, providerSessionID)
		cancel()
		if err != nil {
			log.Printf("[RETENTION] Warning: failed to end OmniChat provider call %s: %v", callID, err)
			continue
		}
		if _, err = w.db.Exec(ctx, `UPDATE omnichat_call_sessions SET provider_session_id=NULL WHERE id=$1 AND provider_session_id=$2`, callID, providerSessionID); err != nil {
			log.Printf("[RETENTION] Warning: failed to record OmniChat provider cleanup %s: %v", callID, err)
		}
	}
}

// cleanupExpiredOmniChatSpeech removes short-lived synthesized speech caches.
// The object is deleted first; the database row remains retryable if storage is
// temporarily unavailable.
func (w *RetentionWorker) cleanupExpiredOmniChatSpeech(ctx context.Context) {
	if w.db == nil || w.voiceStorage == nil {
		return
	}
	log.Println("[RETENTION] Starting expired OmniChat speech cleanup")
	const batchSize = 500
	for {
		rows, err := w.db.Query(ctx, `
			SELECT id, storage_path FROM omnichat_speech_audio
			WHERE expires_at < NOW()
			ORDER BY expires_at
			LIMIT $1
		`, batchSize)
		if err != nil {
			if !isUndefinedTableError(err) {
				log.Printf("[RETENTION] Failed to query expired OmniChat speech: %v", err)
			}
			return
		}
		type expiredSpeech struct {
			id   string
			path string
		}
		items := make([]expiredSpeech, 0, batchSize)
		for rows.Next() {
			var item expiredSpeech
			if err := rows.Scan(&item.id, &item.path); err != nil {
				rows.Close()
				log.Printf("[RETENTION] Failed to scan expired OmniChat speech: %v", err)
				return
			}
			items = append(items, item)
		}
		rowsErr := rows.Err()
		rows.Close()
		if rowsErr != nil {
			log.Printf("[RETENTION] Failed while reading expired OmniChat speech: %v", rowsErr)
			return
		}
		if len(items) == 0 {
			return
		}
		if w.cfg.DryRun {
			log.Printf("[RETENTION][DRY-RUN] Would delete %d expired OmniChat speech files", len(items))
			return
		}
		for _, item := range items {
			tx, err := w.db.Begin(ctx)
			if err != nil {
				log.Printf("[RETENTION] Warning: failed to begin OmniChat speech cleanup for %s: %v", item.id, err)
				continue
			}
			var lockedPath string
			err = tx.QueryRow(ctx, `SELECT storage_path FROM omnichat_speech_audio WHERE id=$1 AND expires_at<NOW() FOR UPDATE`, item.id).Scan(&lockedPath)
			if errors.Is(err, pgx.ErrNoRows) {
				_ = tx.Rollback(ctx)
				continue
			}
			if err != nil {
				_ = tx.Rollback(ctx)
				log.Printf("[RETENTION] Warning: failed to lock OmniChat speech row %s: %v", item.id, err)
				continue
			}
			// Keep the row locked across deletion. A concurrent cache refresh
			// either updates expiry first (so this recheck skips it) or waits
			// until the old object and row are both gone, then inserts fresh.
			if err := w.voiceStorage.Delete(ctx, lockedPath); err != nil {
				_ = tx.Rollback(ctx)
				log.Printf("[RETENTION] Warning: failed to delete OmniChat speech %s: %v", lockedPath, err)
				continue
			}
			if _, err := tx.Exec(ctx, `DELETE FROM omnichat_speech_audio WHERE id=$1`, item.id); err != nil {
				_ = tx.Rollback(ctx)
				log.Printf("[RETENTION] Warning: failed to delete OmniChat speech row %s: %v", item.id, err)
				continue
			}
			// The row DELETE trigger writes a tombstone. The object was removed
			// above while the row lock was held, so acknowledge it atomically to
			// avoid a redundant retention pass tomorrow.
			if _, err := tx.Exec(ctx, `DELETE FROM omnichat_speech_deletion_queue WHERE storage_path=$1`, lockedPath); err != nil {
				_ = tx.Rollback(ctx)
				log.Printf("[RETENTION] Warning: failed to acknowledge OmniChat speech cleanup %s: %v", item.id, err)
				continue
			}
			if err := tx.Commit(ctx); err != nil {
				log.Printf("[RETENTION] Warning: failed to commit OmniChat speech cleanup %s: %v", item.id, err)
			}
		}
		if len(items) < batchSize {
			return
		}
	}
}

// ─── Export cleanup ──────────────────────────────────────────────────────────

func (w *RetentionWorker) cleanupExpiredExports(ctx context.Context) {
	log.Println("[RETENTION] Starting expired export cleanup")

	rows, err := w.db.Query(ctx, `
		SELECT export_id, user_id FROM data_export_requests
		WHERE status = 'completed' AND expires_at < NOW()
	`)
	if err != nil {
		log.Printf("[RETENTION] Failed to query expired exports: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var exportID string
		var userID int
		if err := rows.Scan(&exportID, &userID); err != nil {
			continue
		}

		if w.cfg.DryRun {
			log.Printf("[RETENTION][DRY-RUN] Would delete expired export for user %d: %s", userID, exportID)
			continue
		}

		storageKey := fmt.Sprintf("exports/%d/%s.zip", userID, exportID)
		if err := w.storage.Delete(ctx, storageKey); err != nil {
			log.Printf("[RETENTION] Warning: failed to delete export file %s: %v", storageKey, err)
		} else {
			log.Printf("[RETENTION] Deleted expired export file: %s", storageKey)
		}

		// Mark as expired in DB to preserve audit record
		_, _ = w.db.Exec(ctx, `UPDATE data_export_requests SET status = 'expired' WHERE export_id = $1`, exportID)
	}

	if !w.cfg.DryRun {
		_, _ = w.db.Exec(ctx, "DELETE FROM export_session_keys WHERE expires_at < NOW()")
	}
}

// ─── Message cleanup ─────────────────────────────────────────────────────────

func (w *RetentionWorker) cleanupExpiredMessages(ctx context.Context) {
	log.Println("[RETENTION] Starting expired message cleanup")

	retentionDays := w.getRetentionDays(ctx, "messages", w.cfg.MessageRetentionYears*365)
	const batchSize = 500

	// Step 1: Scrub associated media files before deleting messages (prevents media leakage)
	for {
		rows, err := w.db.Query(ctx, `
			SELECT id, media_file_id
			FROM messages
			WHERE sent_at < NOW() - ($1 * INTERVAL '1 day')
			  AND media_file_id IS NOT NULL
			LIMIT $2
		`, retentionDays, batchSize)
		if err != nil {
			log.Printf("[RETENTION] Failed to query messages with media: %v", err)
			break
		}

		var msgIDs []int
		var mediaIDs []int
		for rows.Next() {
			var msgID, mediaID int
			if err := rows.Scan(&msgID, &mediaID); err == nil {
				msgIDs = append(msgIDs, msgID)
				mediaIDs = append(mediaIDs, mediaID)
			}
		}
		rows.Close()

		if len(msgIDs) == 0 {
			break
		}

		if w.cfg.DryRun {
			log.Printf("[RETENTION][DRY-RUN] Would scrub %d media files from expiring messages", len(mediaIDs))
		} else {
			// Scrub media files concurrently with bounded parallelism
			const maxConcurrent = 10
			sem := make(chan struct{}, maxConcurrent)
			var wg sync.WaitGroup
			for _, mID := range mediaIDs {
				wg.Add(1)
				sem <- struct{}{}
				go func(id int) {
					defer wg.Done()
					defer func() { <-sem }()
					if err := w.scrubber.ScrubMediaFile(ctx, id); err != nil {
						log.Printf("[RETENTION] Warning: failed to scrub media file %d: %v", id, err)
					}
				}(mID)
			}
			wg.Wait()

			// Null out media_file_id on processed messages so the next loop iteration
			// does not re-query the same rows (ScrubMediaFile deletes from media_files
			// but leaves messages.media_file_id pointing to a now-deleted row).
			if _, err := w.db.Exec(ctx,
				`UPDATE messages SET media_file_id = NULL WHERE id = ANY($1)`,
				msgIDs,
			); err != nil {
				log.Printf("[RETENTION] Warning: failed to null media_file_id on scrubbed messages: %v", err)
			}
			time.Sleep(100 * time.Millisecond)
		}

		if len(msgIDs) < batchSize {
			break
		}
	}

	// Step 2: Delete expired messages in batches (includes cascade on message_recipient_keys)
	for {
		if w.cfg.DryRun {
			var count int
			_ = w.db.QueryRow(ctx, `
				SELECT COUNT(*) FROM messages
				WHERE sent_at < NOW() - ($1 * INTERVAL '1 day')
			`, retentionDays).Scan(&count)
			log.Printf("[RETENTION][DRY-RUN] Would delete ~%d expired messages", count)
			break
		}

		tag, err := w.db.Exec(ctx, `
			DELETE FROM messages
			WHERE id IN (
				SELECT id FROM messages
				WHERE sent_at < NOW() - ($1 * INTERVAL '1 day')
				LIMIT $2
			)
		`, retentionDays, batchSize)
		if err != nil {
			log.Printf("[RETENTION] Failed to delete expired messages batch: %v", err)
			break
		}
		if tag.RowsAffected() == 0 {
			break
		}
		log.Printf("[RETENTION] Deleted %d expired messages", tag.RowsAffected())
		time.Sleep(100 * time.Millisecond)
	}
}

// ─── Call log cleanup ────────────────────────────────────────────────────────

func (w *RetentionWorker) cleanupCallLogs(ctx context.Context) {
	log.Println("[RETENTION] Starting call log cleanup")
	retentionDays := w.getRetentionDays(ctx, "call_logs", w.cfg.LogRetentionYears*365)
	const batchSize = 1000

	for {
		if w.cfg.DryRun {
			var count int
			err := w.db.QueryRow(ctx, `
				SELECT COUNT(*) FROM call_logs WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
			`, retentionDays).Scan(&count)
			if err != nil {
				if isUndefinedTableError(err) {
					log.Println("[RETENTION] call_logs table does not exist yet — skipping")
					return
				}
				log.Printf("[RETENTION] Failed to count call logs: %v", err)
				return
			}
			log.Printf("[RETENTION][DRY-RUN] Would delete ~%d expired call logs", count)
			return
		}

		tag, err := w.db.Exec(ctx, `
			DELETE FROM call_logs
			WHERE id IN (
				SELECT id FROM call_logs
				WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
				LIMIT $2
			)
		`, retentionDays, batchSize)
		if err != nil {
			if isUndefinedTableError(err) {
				log.Println("[RETENTION] call_logs table does not exist yet — skipping")
				return
			}
			log.Printf("[RETENTION] Failed to delete call logs batch: %v", err)
			return
		}
		if tag.RowsAffected() == 0 {
			break
		}
		log.Printf("[RETENTION] Deleted %d call log records", tag.RowsAffected())
		time.Sleep(50 * time.Millisecond)
	}
}

// ─── Notification cleanup ────────────────────────────────────────────────────

func (w *RetentionWorker) cleanupExpiredNotifications(ctx context.Context) {
	log.Println("[RETENTION] Starting expired notification cleanup")
	// "notifications" is not in retention_settings; default of 90 days applies.
	// Do not use "audit_logs" here — that data type has a 7-year legal hold.
	retentionDays := w.getRetentionDays(ctx, "notifications", 90)
	const batchSize = 1000

	for {
		if w.cfg.DryRun {
			var count int
			_ = w.db.QueryRow(ctx, `
				SELECT COUNT(*) FROM notifications WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
			`, retentionDays).Scan(&count)
			log.Printf("[RETENTION][DRY-RUN] Would delete ~%d expired notifications", count)
			break
		}

		tag, err := w.db.Exec(ctx, `
			DELETE FROM notifications
			WHERE id IN (
				SELECT id FROM notifications
				WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
				LIMIT $2
			)
		`, retentionDays, batchSize)
		if err != nil {
			log.Printf("[RETENTION] Failed to delete notifications batch: %v", err)
			break
		}
		if tag.RowsAffected() == 0 {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	if !w.cfg.DryRun {
		_, _ = w.db.Exec(ctx, "DELETE FROM notification_batches WHERE created_at < NOW() - INTERVAL '30 days'")
	}
}

// ─── Archive cleanup ─────────────────────────────────────────────────────────

func (w *RetentionWorker) cleanupExpiredArchives(ctx context.Context) {
	log.Println("[RETENTION] Starting archived conversation cleanup")
	retentionDays := w.getRetentionDays(ctx, "archived_conversations", w.cfg.ArchiveRetentionYears*365)
	const batchSize = 50

	for {
		if w.cfg.DryRun {
			var count int
			_ = w.db.QueryRow(ctx, `
				SELECT COUNT(*) FROM conversations
				WHERE status = 'archived' AND archived_at < NOW() - ($1 * INTERVAL '1 day')
			`, retentionDays).Scan(&count)
			log.Printf("[RETENTION][DRY-RUN] Would delete ~%d expired archived conversations", count)
			break
		}

		tag, err := w.db.Exec(ctx, `
			DELETE FROM conversations
			WHERE id IN (
				SELECT id FROM conversations
				WHERE status = 'archived'
				  AND archived_at < NOW() - ($1 * INTERVAL '1 day')
				LIMIT $2
			)
		`, retentionDays, batchSize)
		if err != nil {
			log.Printf("[RETENTION] Failed to delete archived conversations: %v", err)
			break
		}
		if tag.RowsAffected() == 0 {
			break
		}
		log.Printf("[RETENTION] Deleted %d archived conversations", tag.RowsAffected())
		time.Sleep(100 * time.Millisecond)
	}
}

// ─── Analytics anonymization ─────────────────────────────────────────────────

func (w *RetentionWorker) anonymizeAnalytics(ctx context.Context) {
	log.Println("[RETENTION] Starting analytics anonymization")
	retentionDays := w.getRetentionDays(ctx, "analytics_events", w.cfg.LogRetentionYears*365)

	if w.cfg.DryRun {
		var eventsCount, voteCount int
		_ = w.db.QueryRow(ctx, `
			SELECT COUNT(*) FROM analytics_events
			WHERE created_at < NOW() - ($1 * INTERVAL '1 day') AND user_id IS NOT NULL
		`, retentionDays).Scan(&eventsCount)
		_ = w.db.QueryRow(ctx, `
			SELECT COUNT(*) FROM vote_activity
			WHERE hour_bucket < NOW() - ($1 * INTERVAL '1 day')
		`, retentionDays).Scan(&voteCount)
		log.Printf("[RETENTION][DRY-RUN] Would anonymize ~%d analytics events", eventsCount)
		log.Printf("[RETENTION][DRY-RUN] Would delete ~%d old vote_activity records", voteCount)
		return
	}

	// Anonymize analytics_events: remove PII, keep aggregate data
	tag, err := w.db.Exec(ctx, `
		UPDATE analytics_events
		SET user_id = NULL,
		    ip_address = NULL,
		    user_agent = NULL
		WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
		  AND user_id IS NOT NULL
	`, retentionDays)
	if err != nil {
		log.Printf("[RETENTION] Failed to anonymize analytics events: %v", err)
	} else {
		log.Printf("[RETENTION] Anonymized %d analytics events", tag.RowsAffected())
	}

	// vote_activity.voter_id is NOT NULL and cannot be anonymized in place.
	// Delete old records — they have already been processed for notifications.
	const batchSize = 500
	for {
		tag, err := w.db.Exec(ctx, `
			DELETE FROM vote_activity
			WHERE id IN (
				SELECT id FROM vote_activity
				WHERE hour_bucket < NOW() - ($1 * INTERVAL '1 day')
				LIMIT $2
			)
		`, retentionDays, batchSize)
		if err != nil {
			log.Printf("[RETENTION] Failed to delete old vote_activity records: %v", err)
			break
		}
		if tag.RowsAffected() == 0 {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// getRetentionDays returns the configured retention period for the given data type.
// Falls back to defaultDays if no enabled setting exists.
func (w *RetentionWorker) getRetentionDays(ctx context.Context, dataType string, defaultDays int) int {
	var days int
	err := w.db.QueryRow(ctx,
		"SELECT retention_days FROM retention_settings WHERE data_type = $1 AND enabled = TRUE",
		dataType,
	).Scan(&days)
	if err != nil {
		return defaultDays
	}
	return days
}

// isUndefinedTableError returns true if the pgx error is SQLSTATE 42P01
// (relation/table does not exist).
func isUndefinedTableError(err error) bool {
	if e, ok := err.(*pgconn.PgError); ok {
		return e.Code == "42P01"
	}
	return false
}

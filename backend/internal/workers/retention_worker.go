package workers

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/services"
)

// RetentionWorker runs daily data cleanup jobs: message deletion, export expiry,
// notification purge, archive cleanup, and analytics anonymization.
//
// Account deletion is handled separately by AccountCleanupWorker.
// The advisory lock (shared with AccountCleanupWorker) ensures only one job
// runs at a time across all server instances.
type RetentionWorker struct {
	db       *pgxpool.Pool
	scrubber *services.ScrubberService
	storage  services.StorageService
	cfg      config.RetentionConfig
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
	w.cleanupExpiredMessages(ctx)
	w.cleanupCallLogs(ctx)
	w.cleanupExpiredNotifications(ctx)
	w.cleanupExpiredArchives(ctx)
	w.anonymizeAnalytics(ctx)

	log.Println("[RETENTION] All daily cleanup jobs finished")
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

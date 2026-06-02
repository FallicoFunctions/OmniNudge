// Package jobs contains background maintenance jobs run on configurable schedules.
package jobs

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/websocket"
)

// Narrow interfaces satisfied by the concrete model repos.

type expiredMsgRepo interface {
	GetExpiredBefore(ctx context.Context, before time.Time, limit int) ([]models.ExpiredMessage, error)
	AutoDelete(ctx context.Context, messageID int) error
}

type expiredConvRepo interface {
	GetByID(ctx context.Context, id int) (*models.Conversation, error)
}

const (
	// defaultFailedLoginRetention is how long failed_login_attempts rows are kept.
	// This is intentionally longer than the 15-minute lockout window
	// (lockoutWindowMinutes in services/account_lockout.go): rows older than
	// 15 minutes no longer affect the lockout check, but they are retained for
	// 24 hours to provide an audit trail of recent brute-force activity.
	defaultFailedLoginRetention = 24 * time.Hour

	// defaultAuditLogRetention is how long audit_logs rows are kept.
	defaultAuditLogRetention = 90 * 24 * time.Hour // 90 days
)

// CleanupJob runs periodic database maintenance tasks in the background.
type CleanupJob struct {
	pool                *pgxpool.Pool
	failedLoginInterval time.Duration // how often to run the purge
	auditLogInterval    time.Duration
	autoDeleteInterval  time.Duration
	failedLoginRetain   time.Duration // how old rows must be before deletion
	auditLogRetain      time.Duration

	// Set via WithAutoDeleteSweep to enable the expired-message purge.
	msgRepo  expiredMsgRepo
	convRepo expiredConvRepo
	hub      *websocket.Hub
}

// WithFailedLoginInterval overrides the interval between failed-login-attempts purge runs.
func WithFailedLoginInterval(d time.Duration) func(*CleanupJob) {
	return func(j *CleanupJob) { j.failedLoginInterval = d }
}

// WithAuditLogInterval overrides the interval between audit-log purge runs.
func WithAuditLogInterval(d time.Duration) func(*CleanupJob) {
	return func(j *CleanupJob) { j.auditLogInterval = d }
}

// WithAutoDeleteSweep enables the expired-message purge and sets the repositories
// and hub needed to delete messages and broadcast WS events.
func WithAutoDeleteSweep(msgRepo expiredMsgRepo, convRepo expiredConvRepo, hub *websocket.Hub) func(*CleanupJob) {
	return func(j *CleanupJob) {
		j.msgRepo = msgRepo
		j.convRepo = convRepo
		j.hub = hub
	}
}

// WithAutoDeleteInterval overrides how often the expired-message sweep runs (default 1 minute).
func WithAutoDeleteInterval(d time.Duration) func(*CleanupJob) {
	return func(j *CleanupJob) { j.autoDeleteInterval = d }
}

// NewCleanupJob creates a CleanupJob with sensible defaults.
// Call Start(ctx) to begin the background goroutines.
func NewCleanupJob(pool *pgxpool.Pool, opts ...func(*CleanupJob)) *CleanupJob {
	j := &CleanupJob{
		pool:                pool,
		failedLoginInterval: time.Hour,
		auditLogInterval:    24 * time.Hour,
		autoDeleteInterval:  time.Minute,
		failedLoginRetain:   defaultFailedLoginRetention,
		auditLogRetain:      defaultAuditLogRetention,
	}
	for _, opt := range opts {
		opt(j)
	}
	return j
}

// Start launches the cleanup goroutines and blocks until ctx is cancelled.
// Call it in a goroutine: go job.Start(ctx).
func (j *CleanupJob) Start(ctx context.Context) {
	slog.Info("cleanup job started",
		"failed_login_interval", j.failedLoginInterval,
		"audit_log_interval", j.auditLogInterval,
		"auto_delete_interval", j.autoDeleteInterval,
	)

	// Run immediately on startup, then on each tick.
	j.PurgeFailedLogins(ctx)
	j.PurgeAuditLogs(ctx)
	if j.msgRepo != nil {
		j.PurgeExpiredMessages(ctx)
	}

	failedLoginTicker := time.NewTicker(j.failedLoginInterval)
	auditLogTicker := time.NewTicker(j.auditLogInterval)
	autoDeleteTicker := time.NewTicker(j.autoDeleteInterval)
	defer failedLoginTicker.Stop()
	defer auditLogTicker.Stop()
	defer autoDeleteTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Debug("cleanup job stopping")
			return

		case <-failedLoginTicker.C:
			j.PurgeFailedLogins(ctx)

		case <-auditLogTicker.C:
			j.PurgeAuditLogs(ctx)

		case <-autoDeleteTicker.C:
			if j.msgRepo != nil {
				j.PurgeExpiredMessages(ctx)
			}
		}
	}
}

// PurgeFailedLogins deletes failed_login_attempts rows that are older than the
// configured retention period.  It uses integer seconds (make_interval) instead
// of a Go duration string so that PostgreSQL always receives a well-typed
// interval argument regardless of how time.Duration formats itself.
func (j *CleanupJob) PurgeFailedLogins(ctx context.Context) {
	const q = `DELETE FROM failed_login_attempts
	           WHERE attempted_at < NOW() - make_interval(secs => $1)`

	tag, err := j.pool.Exec(ctx, q, j.failedLoginRetain.Seconds())
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			slog.Debug("cleanup: purge cancelled", "job", "failed_login_attempts")
			return
		}
		slog.Error("cleanup: purge failed_login_attempts", "error", err)
		return
	}
	slog.Info("cleanup: purged failed_login_attempts", "rows_deleted", tag.RowsAffected())
}

// PurgeAuditLogs deletes audit_logs rows that are older than the configured
// retention period.  See PurgeFailedLogins for the rationale behind using
// make_interval(secs => $1) rather than a duration string.
func (j *CleanupJob) PurgeAuditLogs(ctx context.Context) {
	const q = `DELETE FROM audit_logs
	           WHERE created_at < NOW() - make_interval(secs => $1)`

	tag, err := j.pool.Exec(ctx, q, j.auditLogRetain.Seconds())
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			slog.Debug("cleanup: purge cancelled", "job", "audit_logs")
			return
		}
		slog.Error("cleanup: purge audit_logs", "error", err)
		return
	}
	slog.Info("cleanup: purged audit_logs", "rows_deleted", tag.RowsAffected())
}

// PurgeExpiredMessages sweeps messages whose delete_at is in the past and permanently
// deletes them. Messages with replies are tombstoned; all others are hard-deleted.
// A WebSocket event is broadcast to connected conversation participants for each deletion.
// Loops in batches of 100 until no expired messages remain, so a large backlog is fully
// drained within a single tick rather than being rate-limited to 100/minute.
func (j *CleanupJob) PurgeExpiredMessages(ctx context.Context) {
	const batchSize = 100
	totalPurged := 0

	for {
		expired, err := j.msgRepo.GetExpiredBefore(ctx, time.Now(), batchSize)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return
			}
			slog.Error("cleanup: fetch expired messages", "error", err)
			return
		}

		for _, msg := range expired {
			if err := j.msgRepo.AutoDelete(ctx, msg.ID); err != nil {
				if errors.Is(err, models.ErrMessageAlreadyDeleted) {
					// Race: already deleted by another path; skip broadcast silently.
					continue
				}
				slog.Warn("cleanup: auto-delete message", "message_id", msg.ID, "error", err)
				continue
			}

			totalPurged++ // count only successful deletions

			participantIDs, err := j.getParticipantIDs(ctx, msg.ConversationID)
			if err != nil {
				slog.Warn("cleanup: fetch participants for broadcast", "conversation_id", msg.ConversationID, "error", err)
				continue
			}

			j.hub.BroadcastToUsers(participantIDs, "message_auto_deleted", map[string]interface{}{
				"message_id":      msg.ID,
				"conversation_id": msg.ConversationID,
			})
		}

		// Fewer than batchSize returned → no more expired messages.
		if len(expired) < batchSize {
			break
		}
	}

	if totalPurged > 0 {
		slog.Info("cleanup: purged expired messages", "count", totalPurged)
	}
}

// getParticipantIDs returns all user IDs for a conversation (group or DM).
func (j *CleanupJob) getParticipantIDs(ctx context.Context, conversationID int) ([]int, error) {
	rows, err := j.convRepo.GetByID(ctx, conversationID)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		return nil, nil
	}

	// Group / mod_mail: participants are in conversation_participants.
	if rows.IsGroup || rows.ConversationType == "mod_mail" {
		dbRows, err := j.pool.Query(ctx,
			`SELECT user_id FROM conversation_participants WHERE conversation_id = $1`,
			conversationID,
		)
		if err != nil {
			return nil, err
		}
		defer dbRows.Close()
		var ids []int
		for dbRows.Next() {
			var uid int
			if err := dbRows.Scan(&uid); err != nil {
				return nil, err
			}
			ids = append(ids, uid)
		}
		return ids, dbRows.Err()
	}

	// DM: user1 and user2.
	var ids []int
	if rows.User1ID != nil {
		ids = append(ids, *rows.User1ID)
	}
	if rows.User2ID != nil {
		ids = append(ids, *rows.User2ID)
	}
	return ids, nil
}

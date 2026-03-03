// Package jobs contains background maintenance jobs run on configurable schedules.
package jobs

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

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
	failedLoginRetain   time.Duration // how old rows must be before deletion
	auditLogRetain      time.Duration
}

// WithFailedLoginInterval overrides the interval between failed-login-attempts purge runs.
func WithFailedLoginInterval(d time.Duration) func(*CleanupJob) {
	return func(j *CleanupJob) { j.failedLoginInterval = d }
}

// WithAuditLogInterval overrides the interval between audit-log purge runs.
func WithAuditLogInterval(d time.Duration) func(*CleanupJob) {
	return func(j *CleanupJob) { j.auditLogInterval = d }
}

// NewCleanupJob creates a CleanupJob with sensible defaults.
// Call Start(ctx) to begin the background goroutines.
func NewCleanupJob(pool *pgxpool.Pool, opts ...func(*CleanupJob)) *CleanupJob {
	j := &CleanupJob{
		pool:                pool,
		failedLoginInterval: time.Hour,
		auditLogInterval:    24 * time.Hour,
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
	)

	// Run immediately on startup, then on each tick.
	j.PurgeFailedLogins(ctx)
	j.PurgeAuditLogs(ctx)

	failedLoginTicker := time.NewTicker(j.failedLoginInterval)
	auditLogTicker := time.NewTicker(j.auditLogInterval)
	defer failedLoginTicker.Stop()
	defer auditLogTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Debug("cleanup job stopping")
			return

		case <-failedLoginTicker.C:
			j.PurgeFailedLogins(ctx)

		case <-auditLogTicker.C:
			j.PurgeAuditLogs(ctx)
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

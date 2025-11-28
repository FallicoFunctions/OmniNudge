package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NotificationBatch represents a scheduled notification for delayed delivery
type NotificationBatch struct {
	ID               int        `json:"id"`
	UserID           int        `json:"user_id"`
	ContentType      string     `json:"content_type"`
	ContentID        int        `json:"content_id"`
	NotificationType string     `json:"notification_type"`
	VotesPerHour     *int       `json:"votes_per_hour,omitempty"`
	MilestoneCount   *int       `json:"milestone_count,omitempty"`
	ScheduledFor     time.Time  `json:"scheduled_for"`
	Status           string     `json:"status"`
	CreatedAt        time.Time  `json:"created_at"`
	ProcessedAt      *time.Time `json:"processed_at,omitempty"`
}

// NotificationBatchRepository handles database operations for notification batches
type NotificationBatchRepository struct {
	pool *pgxpool.Pool
}

// NewNotificationBatchRepository creates a new notification batch repository
func NewNotificationBatchRepository(pool *pgxpool.Pool) *NotificationBatchRepository {
	return &NotificationBatchRepository{pool: pool}
}

// Create creates a new notification batch
func (r *NotificationBatchRepository) Create(ctx context.Context, batch *NotificationBatch) error {
	query := `
		INSERT INTO notification_batches (
			user_id, content_type, content_id, notification_type,
			votes_per_hour, milestone_count, scheduled_for, status
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at
	`

	return r.pool.QueryRow(
		ctx, query,
		batch.UserID,
		batch.ContentType,
		batch.ContentID,
		batch.NotificationType,
		batch.VotesPerHour,
		batch.MilestoneCount,
		batch.ScheduledFor,
		batch.Status,
	).Scan(&batch.ID, &batch.CreatedAt)
}

// GetPendingBatches retrieves all pending batches scheduled before the given time
func (r *NotificationBatchRepository) GetPendingBatches(
	ctx context.Context,
	beforeTime time.Time,
) ([]*NotificationBatch, error) {
	query := `
		SELECT
			id, user_id, content_type, content_id, notification_type,
			votes_per_hour, milestone_count, scheduled_for, status,
			created_at, processed_at
		FROM notification_batches
		WHERE status = 'pending'
		AND scheduled_for <= $1
		ORDER BY scheduled_for ASC
		LIMIT 1000
	`

	rows, err := r.pool.Query(ctx, query, beforeTime)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var batches []*NotificationBatch
	for rows.Next() {
		b := &NotificationBatch{}
		err := rows.Scan(
			&b.ID, &b.UserID, &b.ContentType, &b.ContentID, &b.NotificationType,
			&b.VotesPerHour, &b.MilestoneCount, &b.ScheduledFor, &b.Status,
			&b.CreatedAt, &b.ProcessedAt,
		)
		if err != nil {
			return nil, err
		}
		batches = append(batches, b)
	}

	return batches, rows.Err()
}

// MarkAsProcessed marks a batch as processed
func (r *NotificationBatchRepository) MarkAsProcessed(ctx context.Context, batchID int) error {
	query := `
		UPDATE notification_batches
		SET status = 'processed', processed_at = NOW()
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, batchID)
	return err
}

// CancelBatch cancels pending batches for specific content
// This is used when velocity increases and we want to send immediate notification instead
func (r *NotificationBatchRepository) CancelBatch(
	ctx context.Context,
	userID int,
	contentType string,
	contentID int,
) error {
	query := `
		UPDATE notification_batches
		SET status = 'cancelled', processed_at = NOW()
		WHERE user_id = $1
		AND content_type = $2
		AND content_id = $3
		AND status = 'pending'
	`
	_, err := r.pool.Exec(ctx, query, userID, contentType, contentID)
	return err
}

// CleanupOldBatches deletes processed and cancelled batches older than 7 days
func (r *NotificationBatchRepository) CleanupOldBatches(ctx context.Context) error {
	query := `
		DELETE FROM notification_batches
		WHERE status IN ('processed', 'cancelled')
		AND processed_at < NOW() - INTERVAL '7 days'
	`
	_, err := r.pool.Exec(ctx, query)
	return err
}

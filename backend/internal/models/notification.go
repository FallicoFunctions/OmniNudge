package models

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Notification represents a user notification
type Notification struct {
	ID               int       `json:"id"`
	UserID           int       `json:"user_id"`
	NotificationType string    `json:"notification_type"`
	ContentType      *string   `json:"content_type,omitempty"`
	ContentID        *int      `json:"content_id,omitempty"`
	ActorID          *int      `json:"actor_id,omitempty"`
	Actor            *User     `json:"actor,omitempty"` // Optional populated user info
	MilestoneCount   *int      `json:"milestone_count,omitempty"`
	VotesPerHour     *int      `json:"votes_per_hour,omitempty"`
	Message          string    `json:"message"`
	Read             bool      `json:"read"`
	CreatedAt        time.Time `json:"created_at"`
}

// NotificationRepository handles database operations for notifications
type NotificationRepository struct {
	pool *pgxpool.Pool
}

// NewNotificationRepository creates a new notification repository
func NewNotificationRepository(pool *pgxpool.Pool) *NotificationRepository {
	return &NotificationRepository{pool: pool}
}

// Create creates a new notification
// If a duplicate notification exists (based on unique constraint), it silently ignores the error
func (r *NotificationRepository) Create(ctx context.Context, notification *Notification) error {
	query := `
		INSERT INTO notifications (
			user_id, notification_type, content_type, content_id,
			actor_id, milestone_count, votes_per_hour, message
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at
	`

	err := r.pool.QueryRow(
		ctx, query,
		notification.UserID,
		notification.NotificationType,
		notification.ContentType,
		notification.ContentID,
		notification.ActorID,
		notification.MilestoneCount,
		notification.VotesPerHour,
		notification.Message,
	).Scan(&notification.ID, &notification.CreatedAt)

	if err == nil {
		return nil
	}

	// If this is a duplicate milestone notification, ignore the error
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.SQLState() == "23505" {
		return nil
	}

	return err
}

// GetByUserID retrieves notifications for a specific user with pagination
func (r *NotificationRepository) GetByUserID(
	ctx context.Context,
	userID int,
	limit int,
	offset int,
	unreadOnly bool,
) ([]*Notification, error) {
	query := `
		SELECT
			n.id, n.user_id, n.notification_type, n.content_type, n.content_id,
			n.actor_id, n.milestone_count, n.votes_per_hour, n.message, n.read, n.created_at,
			u.id, u.username, u.avatar_url
		FROM notifications n
		LEFT JOIN users u ON n.actor_id = u.id
		WHERE n.user_id = $1
	`

	if unreadOnly {
		query += " AND n.read = false"
	}

	query += " ORDER BY n.created_at DESC LIMIT $2 OFFSET $3"

	rows, err := r.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifications []*Notification
	for rows.Next() {
		n := &Notification{Actor: &User{}}
		var actorID *int
		var actorUsername *string
		var actorAvatar *string

		err := rows.Scan(
			&n.ID, &n.UserID, &n.NotificationType, &n.ContentType, &n.ContentID,
			&n.ActorID, &n.MilestoneCount, &n.VotesPerHour, &n.Message, &n.Read, &n.CreatedAt,
			&actorID, &actorUsername, &actorAvatar,
		)
		if err != nil {
			return nil, err
		}

		// Populate actor if exists
		if actorID != nil {
			n.Actor.ID = *actorID
			if actorUsername != nil {
				n.Actor.Username = *actorUsername
			}
			n.Actor.AvatarURL = actorAvatar
		} else {
			n.Actor = nil
		}

		notifications = append(notifications, n)
	}

	return notifications, rows.Err()
}

// GetUnreadCount returns the count of unread notifications for a user
func (r *NotificationRepository) GetUnreadCount(ctx context.Context, userID int) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false`
	err := r.pool.QueryRow(ctx, query, userID).Scan(&count)
	return count, err
}

// MarkAsRead marks a specific notification as read
func (r *NotificationRepository) MarkAsRead(ctx context.Context, notificationID, userID int) error {
	query := `
		UPDATE notifications
		SET read = true
		WHERE id = $1 AND user_id = $2
	`
	result, err := r.pool.Exec(ctx, query, notificationID, userID)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("notification not found or does not belong to user")
	}

	return nil
}

// MarkAllAsRead marks all notifications as read for a user
func (r *NotificationRepository) MarkAllAsRead(ctx context.Context, userID int) error {
	query := `UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`
	_, err := r.pool.Exec(ctx, query, userID)
	return err
}

// Delete deletes a notification
func (r *NotificationRepository) Delete(ctx context.Context, notificationID, userID int) error {
	query := `DELETE FROM notifications WHERE id = $1 AND user_id = $2`
	result, err := r.pool.Exec(ctx, query, notificationID, userID)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("notification not found or does not belong to user")
	}

	return nil
}

// GetByID fetches a notification by ID for a specific user
func (r *NotificationRepository) GetByID(ctx context.Context, notificationID, userID int) (*Notification, error) {
	query := `
		SELECT
			n.id, n.user_id, n.notification_type, n.content_type, n.content_id,
			n.actor_id, n.milestone_count, n.votes_per_hour, n.message, n.read, n.created_at,
			u.id, u.username, u.avatar_url
		FROM notifications n
		LEFT JOIN users u ON n.actor_id = u.id
		WHERE n.id = $1 AND n.user_id = $2
	`

	n := &Notification{Actor: &User{}}
	var actorID *int
	var actorUsername *string
	var actorAvatar *string

	err := r.pool.QueryRow(ctx, query, notificationID, userID).Scan(
		&n.ID, &n.UserID, &n.NotificationType, &n.ContentType, &n.ContentID,
		&n.ActorID, &n.MilestoneCount, &n.VotesPerHour, &n.Message, &n.Read, &n.CreatedAt,
		&actorID, &actorUsername, &actorAvatar,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	if actorID != nil {
		n.Actor.ID = *actorID
		if actorUsername != nil {
			n.Actor.Username = *actorUsername
		}
		n.Actor.AvatarURL = actorAvatar
	} else {
		n.Actor = nil
	}

	return n, nil
}

// CheckMilestoneExists checks if a milestone notification already exists
func (r *NotificationRepository) CheckMilestoneExists(
	ctx context.Context,
	userID int,
	contentType string,
	contentID int,
	milestoneCount int,
) (bool, error) {
	var exists bool
	query := `
		SELECT EXISTS(
			SELECT 1 FROM notifications
			WHERE user_id = $1
			AND content_type = $2
			AND content_id = $3
			AND notification_type LIKE '%_milestone'
			AND milestone_count = $4
		)
	`
	err := r.pool.QueryRow(ctx, query, userID, contentType, contentID, milestoneCount).Scan(&exists)
	return exists, err
}

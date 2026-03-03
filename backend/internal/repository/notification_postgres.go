package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresNotificationRepository is a thin adapter over models.NotificationRepository.
type PostgresNotificationRepository struct {
	inner *models.NotificationRepository
}

var _ ports.NotificationRepository = (*PostgresNotificationRepository)(nil)

// NewPostgresNotificationRepository constructs a PostgresNotificationRepository.
func NewPostgresNotificationRepository(pool *pgxpool.Pool) ports.NotificationRepository {
	return &PostgresNotificationRepository{inner: models.NewNotificationRepository(pool)}
}

func (r *PostgresNotificationRepository) Create(ctx context.Context, notification *domain.Notification) error {
	return r.inner.Create(ctx, notification)
}

func (r *PostgresNotificationRepository) GetByUserID(ctx context.Context, userID int, limit int, offset int, unreadOnly bool) ([]*domain.Notification, error) {
	return r.inner.GetByUserID(ctx, userID, limit, offset, unreadOnly)
}

func (r *PostgresNotificationRepository) GetByUserIDWithCursor(ctx context.Context, userID int, limit int, unreadOnly bool, cursor *domain.TimeCursor) ([]*domain.Notification, error) {
	return r.inner.GetByUserIDWithCursor(ctx, userID, limit, unreadOnly, cursor)
}

func (r *PostgresNotificationRepository) GetUnreadCount(ctx context.Context, userID int) (int, error) {
	return r.inner.GetUnreadCount(ctx, userID)
}

func (r *PostgresNotificationRepository) MarkAsRead(ctx context.Context, notificationID, userID int) error {
	return r.inner.MarkAsRead(ctx, notificationID, userID)
}

func (r *PostgresNotificationRepository) MarkAllAsRead(ctx context.Context, userID int) error {
	return r.inner.MarkAllAsRead(ctx, userID)
}

func (r *PostgresNotificationRepository) Delete(ctx context.Context, notificationID, userID int) error {
	return r.inner.Delete(ctx, notificationID, userID)
}

func (r *PostgresNotificationRepository) GetByID(ctx context.Context, notificationID, userID int) (*domain.Notification, error) {
	return r.inner.GetByID(ctx, notificationID, userID)
}

func (r *PostgresNotificationRepository) CheckMilestoneExists(ctx context.Context, userID int, contentType string, contentID int, milestoneCount int) (bool, error) {
	return r.inner.CheckMilestoneExists(ctx, userID, contentType, contentID, milestoneCount)
}

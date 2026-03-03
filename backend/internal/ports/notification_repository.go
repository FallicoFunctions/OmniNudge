package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// NotificationRepository defines the interface for notification persistence operations.
type NotificationRepository interface {
	Create(ctx context.Context, notification *domain.Notification) error
	GetByUserID(ctx context.Context, userID int, limit int, offset int, unreadOnly bool) ([]*domain.Notification, error)
	GetByUserIDWithCursor(ctx context.Context, userID int, limit int, unreadOnly bool, cursor *domain.TimeCursor) ([]*domain.Notification, error)
	GetUnreadCount(ctx context.Context, userID int) (int, error)
	MarkAsRead(ctx context.Context, notificationID, userID int) error
	MarkAllAsRead(ctx context.Context, userID int) error
	Delete(ctx context.Context, notificationID, userID int) error
	GetByID(ctx context.Context, notificationID, userID int) (*domain.Notification, error)
	CheckMilestoneExists(ctx context.Context, userID int, contentType string, contentID int, milestoneCount int) (bool, error)
}

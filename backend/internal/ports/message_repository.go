package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// MessageRepository defines the interface for message persistence operations.
type MessageRepository interface {
	Create(ctx context.Context, message *domain.Message) error
	GetByID(ctx context.Context, id int) (*domain.Message, error)
	GetByConversationID(ctx context.Context, conversationID int, userID int, limit int, offset int) ([]*domain.Message, error)
	GetByConversationIDWithCursor(ctx context.Context, conversationID int, userID int, limit int, cursor *domain.TimeCursor) ([]*domain.Message, error)
	GetByConversationIDForAll(ctx context.Context, conversationID int, viewerID int, limit int, offset int) ([]*domain.Message, error)
	GetByConversationIDForAllWithCursor(ctx context.Context, conversationID int, viewerID int, limit int, cursor *domain.TimeCursor) ([]*domain.Message, error)
	MarkAsDelivered(ctx context.Context, messageID int) error
	MarkUndeliveredAsDelivered(ctx context.Context, conversationID int, recipientID int) ([]domain.DeliveredMessage, error)
	MarkAsRead(ctx context.Context, messageID int) error
	MarkAllAsRead(ctx context.Context, conversationID int, recipientID int) error
	SoftDeleteForUser(ctx context.Context, messageID int, userID int) error
	SoftDeleteForBoth(ctx context.Context, messageID int) error
	HardDelete(ctx context.Context, messageID int) error
	GetUnreadCount(ctx context.Context, conversationID int, userID int) (int, error)
	GetLatestMessage(ctx context.Context, conversationID int, viewerID int) (*domain.Message, error)
}

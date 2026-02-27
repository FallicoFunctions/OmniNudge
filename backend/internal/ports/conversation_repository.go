package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// ConversationRepository defines the interface for conversation persistence operations.
type ConversationRepository interface {
	Create(ctx context.Context, user1ID, user2ID int) (*domain.Conversation, error)
	GetByID(ctx context.Context, id int) (*domain.Conversation, error)
	GetByUsers(ctx context.Context, user1ID, user2ID int) (*domain.Conversation, error)
	GetByUserID(ctx context.Context, userID int, limit, offset int, includeArchived bool) ([]*domain.Conversation, error)
	GetByUserIDWithCursor(ctx context.Context, userID int, limit int, includeArchived bool, cursor *domain.TimeCursor) ([]*domain.Conversation, error)
	GetArchivedByUserID(ctx context.Context, userID int, limit, offset int) ([]*domain.Conversation, error)
	GetArchivedByUserIDWithCursor(ctx context.Context, userID int, limit int, cursor *domain.TimeCursor) ([]*domain.Conversation, error)
	UpdateLastMessageAt(ctx context.Context, conversationID int) error
	Delete(ctx context.Context, conversationID int) error
	Archive(ctx context.Context, conversationID int, userID int) error
	ArchiveBatch(ctx context.Context, conversationIDs []int, userID int) error
	Unarchive(ctx context.Context, conversationID int, userID int) error
	SoftDeleteForUser(ctx context.Context, conversationID int, userID int) error
	HardDeleteMessages(ctx context.Context, conversationID int, senderID int) error
	HardDeleteIfBothDeleted(ctx context.Context, conversationID int) error
	SetMuted(ctx context.Context, conversationID int, userID int, muted bool) error
}

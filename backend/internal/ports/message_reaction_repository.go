package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// MessageReactionRepository defines persistence operations for message reactions.
type MessageReactionRepository interface {
	GetByID(ctx context.Context, id int) (*domain.MessageReaction, error)
	AddReaction(ctx context.Context, messageID, userID int, emoji string) (*domain.MessageReaction, error)
	RemoveReaction(ctx context.Context, reactionID int) error
	GetReactionsByMessageID(ctx context.Context, messageID, viewerID int) ([]domain.ReactionSummary, bool, error)
}

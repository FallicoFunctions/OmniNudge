package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresMessageReactionRepository adapts models.MessageReactionRepository to ports.MessageReactionRepository.
type PostgresMessageReactionRepository struct {
	inner *models.MessageReactionRepository
}

var _ ports.MessageReactionRepository = (*PostgresMessageReactionRepository)(nil)

func NewPostgresMessageReactionRepository(pool *pgxpool.Pool) ports.MessageReactionRepository {
	return &PostgresMessageReactionRepository{inner: models.NewMessageReactionRepository(pool)}
}

func (r *PostgresMessageReactionRepository) GetByID(ctx context.Context, id int) (*domain.MessageReaction, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresMessageReactionRepository) AddReaction(ctx context.Context, messageID, userID int, emoji string) (*domain.MessageReaction, error) {
	return r.inner.AddReaction(ctx, messageID, userID, emoji)
}

func (r *PostgresMessageReactionRepository) RemoveReaction(ctx context.Context, reactionID int) error {
	return r.inner.RemoveReaction(ctx, reactionID)
}

func (r *PostgresMessageReactionRepository) GetReactionsByMessageID(ctx context.Context, messageID, viewerID int) ([]domain.ReactionSummary, bool, error) {
	return r.inner.GetReactionsByMessageID(ctx, messageID, viewerID)
}

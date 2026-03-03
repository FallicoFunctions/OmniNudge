package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresConversationRepository is a thin adapter over models.ConversationRepository.
type PostgresConversationRepository struct {
	inner *models.ConversationRepository
}

var _ ports.ConversationRepository = (*PostgresConversationRepository)(nil)

// NewPostgresConversationRepository constructs a PostgresConversationRepository.
func NewPostgresConversationRepository(pool *pgxpool.Pool) ports.ConversationRepository {
	return &PostgresConversationRepository{inner: models.NewConversationRepository(pool)}
}

func (r *PostgresConversationRepository) Create(ctx context.Context, user1ID, user2ID int) (*domain.Conversation, error) {
	return r.inner.Create(ctx, user1ID, user2ID)
}

func (r *PostgresConversationRepository) GetByID(ctx context.Context, id int) (*domain.Conversation, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresConversationRepository) GetByUsers(ctx context.Context, user1ID, user2ID int) (*domain.Conversation, error) {
	return r.inner.GetByUsers(ctx, user1ID, user2ID)
}

func (r *PostgresConversationRepository) GetByUserID(ctx context.Context, userID int, limit, offset int, includeArchived bool) ([]*domain.Conversation, error) {
	return r.inner.GetByUserID(ctx, userID, limit, offset, includeArchived)
}

func (r *PostgresConversationRepository) GetByUserIDWithCursor(ctx context.Context, userID int, limit int, includeArchived bool, cursor *domain.TimeCursor) ([]*domain.Conversation, error) {
	return r.inner.GetByUserIDWithCursor(ctx, userID, limit, includeArchived, cursor)
}

func (r *PostgresConversationRepository) GetArchivedByUserID(ctx context.Context, userID int, limit, offset int) ([]*domain.Conversation, error) {
	return r.inner.GetArchivedByUserID(ctx, userID, limit, offset)
}

func (r *PostgresConversationRepository) GetArchivedByUserIDWithCursor(ctx context.Context, userID int, limit int, cursor *domain.TimeCursor) ([]*domain.Conversation, error) {
	return r.inner.GetArchivedByUserIDWithCursor(ctx, userID, limit, cursor)
}

func (r *PostgresConversationRepository) UpdateLastMessageAt(ctx context.Context, conversationID int) error {
	return r.inner.UpdateLastMessageAt(ctx, conversationID)
}

func (r *PostgresConversationRepository) Delete(ctx context.Context, conversationID int) error {
	return r.inner.Delete(ctx, conversationID)
}

func (r *PostgresConversationRepository) Archive(ctx context.Context, conversationID int, userID int) error {
	return r.inner.Archive(ctx, conversationID, userID)
}

func (r *PostgresConversationRepository) ArchiveBatch(ctx context.Context, conversationIDs []int, userID int) error {
	return r.inner.ArchiveBatch(ctx, conversationIDs, userID)
}

func (r *PostgresConversationRepository) Unarchive(ctx context.Context, conversationID int, userID int) error {
	return r.inner.Unarchive(ctx, conversationID, userID)
}

func (r *PostgresConversationRepository) SoftDeleteForUser(ctx context.Context, conversationID int, userID int) error {
	return r.inner.SoftDeleteForUser(ctx, conversationID, userID)
}

func (r *PostgresConversationRepository) HardDeleteMessages(ctx context.Context, conversationID int, senderID int) error {
	return r.inner.HardDeleteMessages(ctx, conversationID, senderID)
}

func (r *PostgresConversationRepository) HardDeleteIfBothDeleted(ctx context.Context, conversationID int) error {
	return r.inner.HardDeleteIfBothDeleted(ctx, conversationID)
}

func (r *PostgresConversationRepository) SetMuted(ctx context.Context, conversationID int, userID int, muted bool) error {
	return r.inner.SetMuted(ctx, conversationID, userID, muted)
}

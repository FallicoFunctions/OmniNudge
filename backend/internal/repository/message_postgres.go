package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresMessageRepository is a thin adapter over models.MessageRepository.
type PostgresMessageRepository struct {
	inner *models.MessageRepository
}

var _ ports.MessageRepository = (*PostgresMessageRepository)(nil)

// NewPostgresMessageRepository constructs a PostgresMessageRepository.
func NewPostgresMessageRepository(pool *pgxpool.Pool) ports.MessageRepository {
	return &PostgresMessageRepository{inner: models.NewMessageRepository(pool)}
}

func (r *PostgresMessageRepository) Create(ctx context.Context, message *domain.Message) error {
	return r.inner.Create(ctx, message)
}

func (r *PostgresMessageRepository) GetByID(ctx context.Context, id int) (*domain.Message, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresMessageRepository) GetByConversationID(ctx context.Context, conversationID int, userID int, limit int, offset int) ([]*domain.Message, error) {
	return r.inner.GetByConversationID(ctx, conversationID, userID, limit, offset)
}

func (r *PostgresMessageRepository) GetByConversationIDWithCursor(ctx context.Context, conversationID int, userID int, limit int, cursor *domain.TimeCursor) ([]*domain.Message, error) {
	return r.inner.GetByConversationIDWithCursor(ctx, conversationID, userID, limit, cursor)
}

func (r *PostgresMessageRepository) GetByConversationIDForAll(ctx context.Context, conversationID int, viewerID int, limit int, offset int) ([]*domain.Message, error) {
	return r.inner.GetByConversationIDForAll(ctx, conversationID, viewerID, limit, offset)
}

func (r *PostgresMessageRepository) GetByConversationIDForAllWithCursor(ctx context.Context, conversationID int, viewerID int, limit int, cursor *domain.TimeCursor) ([]*domain.Message, error) {
	return r.inner.GetByConversationIDForAllWithCursor(ctx, conversationID, viewerID, limit, cursor)
}

func (r *PostgresMessageRepository) MarkAsDelivered(ctx context.Context, messageID int) error {
	return r.inner.MarkAsDelivered(ctx, messageID)
}

func (r *PostgresMessageRepository) MarkUndeliveredAsDelivered(ctx context.Context, conversationID int, recipientID int) ([]domain.DeliveredMessage, error) {
	return r.inner.MarkUndeliveredAsDelivered(ctx, conversationID, recipientID)
}

func (r *PostgresMessageRepository) MarkAsRead(ctx context.Context, messageID int) error {
	return r.inner.MarkAsRead(ctx, messageID)
}

func (r *PostgresMessageRepository) MarkAllAsRead(ctx context.Context, conversationID int, recipientID int) error {
	return r.inner.MarkAllAsRead(ctx, conversationID, recipientID)
}

func (r *PostgresMessageRepository) SoftDeleteForUser(ctx context.Context, messageID int, userID int) error {
	return r.inner.SoftDeleteForUser(ctx, messageID, userID)
}

func (r *PostgresMessageRepository) SoftDeleteForBoth(ctx context.Context, messageID int) error {
	return r.inner.SoftDeleteForBoth(ctx, messageID)
}

func (r *PostgresMessageRepository) HardDelete(ctx context.Context, messageID int) error {
	return r.inner.HardDelete(ctx, messageID)
}

func (r *PostgresMessageRepository) GetUnreadCount(ctx context.Context, conversationID int, userID int) (int, error) {
	return r.inner.GetUnreadCount(ctx, conversationID, userID)
}

func (r *PostgresMessageRepository) GetLatestMessage(ctx context.Context, conversationID int, viewerID int) (*domain.Message, error) {
	return r.inner.GetLatestMessage(ctx, conversationID, viewerID)
}

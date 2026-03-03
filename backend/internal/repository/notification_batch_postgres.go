package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresNotificationBatchRepository is a thin adapter over models.NotificationBatchRepository.
type PostgresNotificationBatchRepository struct {
	inner *models.NotificationBatchRepository
}

var _ ports.NotificationBatchRepository = (*PostgresNotificationBatchRepository)(nil)

// NewPostgresNotificationBatchRepository constructs a PostgresNotificationBatchRepository.
func NewPostgresNotificationBatchRepository(pool *pgxpool.Pool) ports.NotificationBatchRepository {
	return &PostgresNotificationBatchRepository{inner: models.NewNotificationBatchRepository(pool)}
}

func (r *PostgresNotificationBatchRepository) Create(ctx context.Context, batch *domain.NotificationBatch) error {
	return r.inner.Create(ctx, batch)
}

func (r *PostgresNotificationBatchRepository) GetPendingBatches(ctx context.Context, beforeTime time.Time) ([]*domain.NotificationBatch, error) {
	return r.inner.GetPendingBatches(ctx, beforeTime)
}

func (r *PostgresNotificationBatchRepository) MarkAsProcessed(ctx context.Context, batchID int) error {
	return r.inner.MarkAsProcessed(ctx, batchID)
}

func (r *PostgresNotificationBatchRepository) CancelBatch(ctx context.Context, userID int, contentType string, contentID int) error {
	return r.inner.CancelBatch(ctx, userID, contentType, contentID)
}

func (r *PostgresNotificationBatchRepository) CleanupOldBatches(ctx context.Context) error {
	return r.inner.CleanupOldBatches(ctx)
}

package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresRemovedContentRepository is a thin adapter over models.RemovedContentRepository.
type PostgresRemovedContentRepository struct {
	inner *models.RemovedContentRepository
}

var _ ports.RemovedContentRepository = (*PostgresRemovedContentRepository)(nil)

// NewPostgresRemovedContentRepository constructs a PostgresRemovedContentRepository.
func NewPostgresRemovedContentRepository(pool *pgxpool.Pool) ports.RemovedContentRepository {
	return &PostgresRemovedContentRepository{inner: models.NewRemovedContentRepository(pool)}
}

func (r *PostgresRemovedContentRepository) RemoveContent(ctx context.Context, contentType string, contentID int, hubID *int, removedBy int, removalReasonID *int, customReason, modNote string) (*domain.RemovedContent, error) {
	return r.inner.RemoveContent(ctx, contentType, contentID, hubID, removedBy, removalReasonID, customReason, modNote)
}

func (r *PostgresRemovedContentRepository) RestoreContent(ctx context.Context, contentType string, contentID int) error {
	return r.inner.RestoreContent(ctx, contentType, contentID)
}

func (r *PostgresRemovedContentRepository) IsContentRemoved(ctx context.Context, contentType string, contentID int) (bool, error) {
	return r.inner.IsContentRemoved(ctx, contentType, contentID)
}

func (r *PostgresRemovedContentRepository) GetByContent(ctx context.Context, contentType string, contentID int) (*domain.RemovedContent, error) {
	return r.inner.GetByContent(ctx, contentType, contentID)
}

func (r *PostgresRemovedContentRepository) GetByHub(ctx context.Context, hubID int, limit, offset int) ([]*domain.RemovedContent, error) {
	return r.inner.GetByHub(ctx, hubID, limit, offset)
}

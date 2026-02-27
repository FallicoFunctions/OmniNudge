package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresMediaFileRepository is a thin adapter over models.MediaFileRepository.
type PostgresMediaFileRepository struct {
	inner *models.MediaFileRepository
}

var _ ports.MediaFileRepository = (*PostgresMediaFileRepository)(nil)

// NewPostgresMediaFileRepository constructs a PostgresMediaFileRepository.
func NewPostgresMediaFileRepository(pool *pgxpool.Pool) ports.MediaFileRepository {
	return &PostgresMediaFileRepository{inner: models.NewMediaFileRepository(pool)}
}

func (r *PostgresMediaFileRepository) Create(ctx context.Context, media *domain.MediaFile) error {
	return r.inner.Create(ctx, media)
}

func (r *PostgresMediaFileRepository) GetByStorageURL(ctx context.Context, storageURL string) (*domain.MediaFile, error) {
	return r.inner.GetByStorageURL(ctx, storageURL)
}

func (r *PostgresMediaFileRepository) GetByID(ctx context.Context, id int) (*domain.MediaFile, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresMediaFileRepository) GetTotalStorageByUserID(ctx context.Context, userID int) (int64, error) {
	return r.inner.GetTotalStorageByUserID(ctx, userID)
}

func (r *PostgresMediaFileRepository) GetTrackedStorageByUserID(ctx context.Context, userID int) (int64, error) {
	return r.inner.GetTrackedStorageByUserID(ctx, userID)
}

func (r *PostgresMediaFileRepository) UpdateThumbnailURL(ctx context.Context, mediaID int, thumbnailURL string) error {
	return r.inner.UpdateThumbnailURL(ctx, mediaID, thumbnailURL)
}

func (r *PostgresMediaFileRepository) DeleteByID(ctx context.Context, mediaID int) error {
	return r.inner.DeleteByID(ctx, mediaID)
}

func (r *PostgresMediaFileRepository) GetByPublicURL(ctx context.Context, publicURL string) (*domain.MediaFile, error) {
	return r.inner.GetByPublicURL(ctx, publicURL)
}

func (r *PostgresMediaFileRepository) MarkScanClean(ctx context.Context, mediaID int) error {
	return r.inner.MarkScanClean(ctx, mediaID)
}

func (r *PostgresMediaFileRepository) MarkScanError(ctx context.Context, mediaID int, scanErr string) error {
	return r.inner.MarkScanError(ctx, mediaID, scanErr)
}

func (r *PostgresMediaFileRepository) MarkScanInfected(ctx context.Context, mediaID int, reason string) error {
	return r.inner.MarkScanInfected(ctx, mediaID, reason)
}

package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresFeedRepository adapts models.FeedRepository to ports.FeedRepository.
// Because domain.* types are aliases for models.* types, no conversion is needed.
type PostgresFeedRepository struct {
	inner *models.FeedRepository
}

// Compile-time interface check.
var _ ports.FeedRepository = (*PostgresFeedRepository)(nil)

// NewPostgresFeedRepository creates a PostgresFeedRepository satisfying ports.FeedRepository.
func NewPostgresFeedRepository(pool *pgxpool.Pool) ports.FeedRepository {
	return &PostgresFeedRepository{inner: models.NewFeedRepository(pool)}
}

func (r *PostgresFeedRepository) GetUnifiedFeed(ctx context.Context, sortBy string, limit, offset int, sourceFilter string) ([]*domain.UnifiedFeedItem, error) {
	return r.inner.GetUnifiedFeed(ctx, sortBy, limit, offset, sourceFilter)
}

package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresHubRepository adapts models.HubRepository to ports.HubRepository.
// Because domain.* types are aliases for models.* types, no conversion is needed.
type PostgresHubRepository struct {
	inner *models.HubRepository
}

// Compile-time interface check.
var _ ports.HubRepository = (*PostgresHubRepository)(nil)

// NewPostgresHubRepository creates a PostgresHubRepository satisfying ports.HubRepository.
func NewPostgresHubRepository(pool *pgxpool.Pool) ports.HubRepository {
	return &PostgresHubRepository{inner: models.NewHubRepository(pool)}
}

func (r *PostgresHubRepository) Create(ctx context.Context, h *domain.Hub) error {
	return r.inner.Create(ctx, h)
}

func (r *PostgresHubRepository) GetByName(ctx context.Context, name string) (*domain.Hub, error) {
	return r.inner.GetByName(ctx, name)
}

func (r *PostgresHubRepository) GetByID(ctx context.Context, id int) (*domain.Hub, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresHubRepository) List(ctx context.Context, limit, offset int, includeNsfw bool) ([]*domain.Hub, error) {
	return r.inner.List(ctx, limit, offset, includeNsfw)
}

func (r *PostgresHubRepository) ListAgentTargets(ctx context.Context) ([]*domain.HubTarget, error) {
	return r.inner.ListAgentTargets(ctx)
}

func (r *PostgresHubRepository) ListByPrefix(ctx context.Context, prefix string, limit, offset int, includeNsfw bool) ([]*domain.Hub, error) {
	return r.inner.ListByPrefix(ctx, prefix, limit, offset, includeNsfw)
}

func (r *PostgresHubRepository) UpsertHubTopicFilters(ctx context.Context, hubID int, denyKeywords []string) error {
	return r.inner.UpsertHubTopicFilters(ctx, hubID, denyKeywords)
}

func (r *PostgresHubRepository) GetPopularHubs(ctx context.Context, limit, offset int) ([]*domain.Hub, error) {
	return r.inner.GetPopularHubs(ctx, limit, offset)
}

func (r *PostgresHubRepository) SearchHubs(ctx context.Context, query string, limit int) ([]*domain.Hub, error) {
	return r.inner.SearchHubs(ctx, query, limit)
}

func (r *PostgresHubRepository) GetTrendingHubs(ctx context.Context, limit int) ([]*domain.Hub, error) {
	return r.inner.GetTrendingHubs(ctx, limit)
}

func (r *PostgresHubRepository) UpdateNSFW(ctx context.Context, hubID int, nsfw bool) error {
	return r.inner.UpdateNSFW(ctx, hubID, nsfw)
}

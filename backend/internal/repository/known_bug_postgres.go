package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresKnownBugRepository is a thin adapter over models.KnownBugRepository.
type PostgresKnownBugRepository struct {
	inner *models.KnownBugRepository
}

var _ ports.KnownBugRepository = (*PostgresKnownBugRepository)(nil)

// NewPostgresKnownBugRepository constructs a PostgresKnownBugRepository.
func NewPostgresKnownBugRepository(pool *pgxpool.Pool) ports.KnownBugRepository {
	return &PostgresKnownBugRepository{inner: models.NewKnownBugRepository(pool)}
}

func (r *PostgresKnownBugRepository) GetAll(ctx context.Context, status *string) ([]*domain.KnownBug, error) {
	return r.inner.GetAll(ctx, status)
}

func (r *PostgresKnownBugRepository) Create(ctx context.Context, bug *domain.KnownBug) error {
	return r.inner.Create(ctx, bug)
}

func (r *PostgresKnownBugRepository) Update(ctx context.Context, bug *domain.KnownBug) error {
	return r.inner.Update(ctx, bug)
}

func (r *PostgresKnownBugRepository) Delete(ctx context.Context, id int) error {
	return r.inner.Delete(ctx, id)
}

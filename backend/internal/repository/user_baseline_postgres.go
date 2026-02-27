package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.UserBaselineRepository = (*PostgresUserBaselineRepository)(nil)

// PostgresUserBaselineRepository wraps the model-layer repository.
type PostgresUserBaselineRepository struct {
	inner *models.UserBaselineRepository
}

// NewPostgresUserBaselineRepository constructs the adapter.
func NewPostgresUserBaselineRepository(pool *pgxpool.Pool) ports.UserBaselineRepository {
	return &PostgresUserBaselineRepository{inner: models.NewUserBaselineRepository(pool)}
}

func (r *PostgresUserBaselineRepository) GetByUserID(ctx context.Context, userID int) (*domain.UserBaseline, error) {
	return r.inner.GetByUserID(ctx, userID)
}

func (r *PostgresUserBaselineRepository) CreateOrUpdate(ctx context.Context, baseline *domain.UserBaseline) error {
	return r.inner.CreateOrUpdate(ctx, baseline)
}

func (r *PostgresUserBaselineRepository) IsNewUser(ctx context.Context, userID int) (bool, error) {
	return r.inner.IsNewUser(ctx, userID)
}

func (r *PostgresUserBaselineRepository) GetExperienceLevel(ctx context.Context, userID int) (string, error) {
	return r.inner.GetExperienceLevel(ctx, userID)
}

func (r *PostgresUserBaselineRepository) GetAllStaleBaselines(ctx context.Context) ([]*domain.UserBaseline, error) {
	return r.inner.GetAllStaleBaselines(ctx)
}

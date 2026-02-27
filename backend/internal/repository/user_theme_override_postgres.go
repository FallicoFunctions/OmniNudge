package repository

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresUserThemeOverrideRepository struct {
	inner *models.UserThemeOverrideRepository
}

// NewPostgresUserThemeOverrideRepository returns a ports.UserThemeOverrideRepository backed by Postgres.
func NewPostgresUserThemeOverrideRepository(pool *pgxpool.Pool) ports.UserThemeOverrideRepository {
	return &PostgresUserThemeOverrideRepository{inner: models.NewUserThemeOverrideRepository(pool)}
}

var _ ports.UserThemeOverrideRepository = (*PostgresUserThemeOverrideRepository)(nil)

func (r *PostgresUserThemeOverrideRepository) SetOverride(ctx context.Context, userID int, pageName string, themeID int) (*domain.UserThemeOverride, error) {
	return r.inner.SetOverride(ctx, userID, pageName, themeID)
}

func (r *PostgresUserThemeOverrideRepository) GetOverride(ctx context.Context, userID int, pageName string) (*domain.UserThemeOverride, error) {
	return r.inner.GetOverride(ctx, userID, pageName)
}

func (r *PostgresUserThemeOverrideRepository) GetAllOverrides(ctx context.Context, userID int) ([]*domain.UserThemeOverride, error) {
	return r.inner.GetAllOverrides(ctx, userID)
}

func (r *PostgresUserThemeOverrideRepository) DeleteOverride(ctx context.Context, userID int, pageName string) error {
	return r.inner.DeleteOverride(ctx, userID, pageName)
}

func (r *PostgresUserThemeOverrideRepository) DeleteAllOverrides(ctx context.Context, userID int) error {
	return r.inner.DeleteAllOverrides(ctx, userID)
}

package repository

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresUserInstalledThemeRepository struct {
	inner *models.UserInstalledThemeRepository
}

// NewPostgresUserInstalledThemeRepository returns a ports.UserInstalledThemeRepository backed by Postgres.
func NewPostgresUserInstalledThemeRepository(pool *pgxpool.Pool) ports.UserInstalledThemeRepository {
	return &PostgresUserInstalledThemeRepository{inner: models.NewUserInstalledThemeRepository(pool)}
}

var _ ports.UserInstalledThemeRepository = (*PostgresUserInstalledThemeRepository)(nil)

func (r *PostgresUserInstalledThemeRepository) Install(ctx context.Context, userID, themeID, pricePaid int) (*domain.UserInstalledTheme, error) {
	return r.inner.Install(ctx, userID, themeID, pricePaid)
}

func (r *PostgresUserInstalledThemeRepository) GetInstalledTheme(ctx context.Context, userID, themeID int) (*domain.UserInstalledTheme, error) {
	return r.inner.GetInstalledTheme(ctx, userID, themeID)
}

func (r *PostgresUserInstalledThemeRepository) GetUserInstalledThemes(ctx context.Context, userID int) ([]*domain.UserInstalledTheme, error) {
	return r.inner.GetUserInstalledThemes(ctx, userID)
}

func (r *PostgresUserInstalledThemeRepository) SetActive(ctx context.Context, userID, themeID int) error {
	return r.inner.SetActive(ctx, userID, themeID)
}

func (r *PostgresUserInstalledThemeRepository) RateTheme(ctx context.Context, userID, themeID, rating int, review *string) error {
	return r.inner.RateTheme(ctx, userID, themeID, rating, review)
}

func (r *PostgresUserInstalledThemeRepository) Uninstall(ctx context.Context, userID, themeID int) error {
	return r.inner.Uninstall(ctx, userID, themeID)
}

func (r *PostgresUserInstalledThemeRepository) HasInstalled(ctx context.Context, userID, themeID int) (bool, error) {
	return r.inner.HasInstalled(ctx, userID, themeID)
}

func (r *PostgresUserInstalledThemeRepository) GetActiveTheme(ctx context.Context, userID int) (*domain.UserInstalledTheme, error) {
	return r.inner.GetActiveTheme(ctx, userID)
}

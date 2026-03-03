package repository

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresUserThemeRepository struct {
	inner *models.UserThemeRepository
}

// NewPostgresUserThemeRepository returns a ports.UserThemeRepository backed by Postgres.
func NewPostgresUserThemeRepository(pool *pgxpool.Pool) ports.UserThemeRepository {
	return &PostgresUserThemeRepository{inner: models.NewUserThemeRepository(pool)}
}

var _ ports.UserThemeRepository = (*PostgresUserThemeRepository)(nil)

func (r *PostgresUserThemeRepository) Create(ctx context.Context, theme *domain.UserTheme) (*domain.UserTheme, error) {
	return r.inner.Create(ctx, theme)
}

func (r *PostgresUserThemeRepository) GetByID(ctx context.Context, id int) (*domain.UserTheme, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresUserThemeRepository) GetByUserID(ctx context.Context, userID int, limit, offset int) ([]*domain.UserTheme, error) {
	return r.inner.GetByUserID(ctx, userID, limit, offset)
}

func (r *PostgresUserThemeRepository) GetByUserIDWithCursor(ctx context.Context, userID int, limit int, cursor *domain.TimeCursor) ([]*domain.UserTheme, error) {
	return r.inner.GetByUserIDWithCursor(ctx, userID, limit, cursor)
}

func (r *PostgresUserThemeRepository) GetPublicThemes(ctx context.Context, limit, offset int, category *string) ([]*domain.UserTheme, error) {
	return r.inner.GetPublicThemes(ctx, limit, offset, category)
}

func (r *PostgresUserThemeRepository) GetPublicThemesWithCursor(ctx context.Context, limit int, category *string, cursor *domain.ThemePublicCursor) ([]*domain.UserTheme, error) {
	return r.inner.GetPublicThemesWithCursor(ctx, limit, category, cursor)
}

func (r *PostgresUserThemeRepository) Update(ctx context.Context, theme *domain.UserTheme) error {
	return r.inner.Update(ctx, theme)
}

func (r *PostgresUserThemeRepository) Delete(ctx context.Context, themeID, userID int) error {
	return r.inner.Delete(ctx, themeID, userID)
}

func (r *PostgresUserThemeRepository) GetPredefinedThemes(ctx context.Context) ([]*domain.UserTheme, error) {
	return r.inner.GetPredefinedThemes(ctx)
}

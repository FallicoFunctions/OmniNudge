package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.UserSettingsRepository = (*PostgresUserSettingsRepository)(nil)

// PostgresUserSettingsRepository wraps the model-layer repository.
type PostgresUserSettingsRepository struct {
	inner *models.UserSettingsRepository
}

// NewPostgresUserSettingsRepository constructs the adapter.
func NewPostgresUserSettingsRepository(pool *pgxpool.Pool) ports.UserSettingsRepository {
	return &PostgresUserSettingsRepository{inner: models.NewUserSettingsRepository(pool)}
}

func (r *PostgresUserSettingsRepository) GetByUserID(ctx context.Context, userID int) (*domain.UserSettings, error) {
	return r.inner.GetByUserID(ctx, userID)
}

func (r *PostgresUserSettingsRepository) CreateDefault(ctx context.Context, userID int) (*domain.UserSettings, error) {
	return r.inner.CreateDefault(ctx, userID)
}

func (r *PostgresUserSettingsRepository) Update(ctx context.Context, settings *domain.UserSettings) (*domain.UserSettings, error) {
	return r.inner.Update(ctx, settings)
}

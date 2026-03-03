package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresDeviceTokenRepository adapts models.DeviceTokenRepository to ports.DeviceTokenRepository.
type PostgresDeviceTokenRepository struct {
	inner *models.DeviceTokenRepository
}

var _ ports.DeviceTokenRepository = (*PostgresDeviceTokenRepository)(nil)

func NewPostgresDeviceTokenRepository(pool *pgxpool.Pool) ports.DeviceTokenRepository {
	return &PostgresDeviceTokenRepository{inner: models.NewDeviceTokenRepository(pool)}
}

func (r *PostgresDeviceTokenRepository) Upsert(ctx context.Context, dt *domain.DeviceToken) error {
	return r.inner.Upsert(ctx, dt)
}

func (r *PostgresDeviceTokenRepository) DeleteByUserAndToken(ctx context.Context, userID int, token string) error {
	return r.inner.DeleteByUserAndToken(ctx, userID, token)
}

func (r *PostgresDeviceTokenRepository) GetByUserID(ctx context.Context, userID int) ([]*domain.DeviceToken, error) {
	return r.inner.GetByUserID(ctx, userID)
}

func (r *PostgresDeviceTokenRepository) UpdateLastUsed(ctx context.Context, token string) error {
	return r.inner.UpdateLastUsed(ctx, token)
}

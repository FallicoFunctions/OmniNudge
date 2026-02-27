package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresModLogRepository is a thin adapter over models.ModLogRepository.
type PostgresModLogRepository struct {
	inner *models.ModLogRepository
}

var _ ports.ModLogRepository = (*PostgresModLogRepository)(nil)

// NewPostgresModLogRepository constructs a PostgresModLogRepository.
func NewPostgresModLogRepository(pool *pgxpool.Pool) ports.ModLogRepository {
	return &PostgresModLogRepository{inner: models.NewModLogRepository(pool)}
}

func (r *PostgresModLogRepository) Log(ctx context.Context, hubID, moderatorID int, action, targetType string, targetID int, details domain.JSONB) (*domain.ModLog, error) {
	return r.inner.Log(ctx, hubID, moderatorID, action, targetType, targetID, details)
}

func (r *PostgresModLogRepository) GetByHub(ctx context.Context, hubID int, limit, offset int) ([]*domain.ModLog, error) {
	return r.inner.GetByHub(ctx, hubID, limit, offset)
}

func (r *PostgresModLogRepository) GetByHubWithCursor(ctx context.Context, hubID int, limit int, cursor *domain.TimeCursor) ([]*domain.ModLog, error) {
	return r.inner.GetByHubWithCursor(ctx, hubID, limit, cursor)
}

func (r *PostgresModLogRepository) GetByModerator(ctx context.Context, moderatorID int, limit, offset int) ([]*domain.ModLog, error) {
	return r.inner.GetByModerator(ctx, moderatorID, limit, offset)
}

func (r *PostgresModLogRepository) GetByAction(ctx context.Context, hubID int, action string, limit, offset int) ([]*domain.ModLog, error) {
	return r.inner.GetByAction(ctx, hubID, action, limit, offset)
}

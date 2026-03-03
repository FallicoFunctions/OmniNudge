package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.HubModeratorRepository = (*PostgresHubModeratorRepository)(nil)

// PostgresHubModeratorRepository wraps the model-layer repository.
type PostgresHubModeratorRepository struct {
	inner *models.HubModeratorRepository
}

// NewPostgresHubModeratorRepository constructs the adapter.
func NewPostgresHubModeratorRepository(pool *pgxpool.Pool) ports.HubModeratorRepository {
	return &PostgresHubModeratorRepository{inner: models.NewHubModeratorRepository(pool)}
}

func (r *PostgresHubModeratorRepository) AddModerator(ctx context.Context, hubID, userID int) error {
	return r.inner.AddModerator(ctx, hubID, userID)
}

func (r *PostgresHubModeratorRepository) IsModerator(ctx context.Context, hubID, userID int) (bool, error) {
	return r.inner.IsModerator(ctx, hubID, userID)
}

func (r *PostgresHubModeratorRepository) GetModeratorsForHub(ctx context.Context, hubID int) ([]domain.HubModeratorUser, error) {
	return r.inner.GetModeratorsForHub(ctx, hubID)
}

func (r *PostgresHubModeratorRepository) GetHubsForModerator(ctx context.Context, userID int) ([]domain.ModeratedHubSummary, error) {
	return r.inner.GetHubsForModerator(ctx, userID)
}

func (r *PostgresHubModeratorRepository) RemoveModerator(ctx context.Context, hubID, userID int) error {
	return r.inner.RemoveModerator(ctx, hubID, userID)
}

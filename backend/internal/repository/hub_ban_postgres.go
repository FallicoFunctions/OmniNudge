package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.HubBanRepository = (*PostgresHubBanRepository)(nil)

// PostgresHubBanRepository wraps the model-layer repository.
type PostgresHubBanRepository struct {
	inner *models.HubBanRepository
}

// NewPostgresHubBanRepository constructs the adapter.
func NewPostgresHubBanRepository(pool *pgxpool.Pool) ports.HubBanRepository {
	return &PostgresHubBanRepository{inner: models.NewHubBanRepository(pool)}
}

func (r *PostgresHubBanRepository) BanUser(ctx context.Context, hubID, userID, bannedBy int, reason, note string, banType string, expiresAt *time.Time) (*domain.HubBan, error) {
	return r.inner.BanUser(ctx, hubID, userID, bannedBy, reason, note, banType, expiresAt)
}

func (r *PostgresHubBanRepository) UnbanUser(ctx context.Context, hubID, userID int) error {
	return r.inner.UnbanUser(ctx, hubID, userID)
}

func (r *PostgresHubBanRepository) IsUserBanned(ctx context.Context, hubID, userID int) (bool, error) {
	return r.inner.IsUserBanned(ctx, hubID, userID)
}

func (r *PostgresHubBanRepository) GetBanByUser(ctx context.Context, hubID, userID int) (*domain.HubBan, error) {
	return r.inner.GetBanByUser(ctx, hubID, userID)
}

func (r *PostgresHubBanRepository) GetBannedUsers(ctx context.Context, hubID int) ([]*domain.HubBan, error) {
	return r.inner.GetBannedUsers(ctx, hubID)
}

func (r *PostgresHubBanRepository) CleanExpiredBans(ctx context.Context) (int64, error) {
	return r.inner.CleanExpiredBans(ctx)
}

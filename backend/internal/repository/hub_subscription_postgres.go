package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.HubSubscriptionRepository = (*PostgresHubSubscriptionRepository)(nil)

// PostgresHubSubscriptionRepository wraps the model-layer repository.
type PostgresHubSubscriptionRepository struct {
	inner *models.HubSubscriptionRepository
}

// NewPostgresHubSubscriptionRepository constructs the adapter.
func NewPostgresHubSubscriptionRepository(pool *pgxpool.Pool) ports.HubSubscriptionRepository {
	return &PostgresHubSubscriptionRepository{inner: models.NewHubSubscriptionRepository(pool)}
}

func (r *PostgresHubSubscriptionRepository) Subscribe(ctx context.Context, userID, hubID int) error {
	return r.inner.Subscribe(ctx, userID, hubID)
}

func (r *PostgresHubSubscriptionRepository) Unsubscribe(ctx context.Context, userID, hubID int) error {
	return r.inner.Unsubscribe(ctx, userID, hubID)
}

func (r *PostgresHubSubscriptionRepository) IsSubscribed(ctx context.Context, userID, hubID int) (bool, error) {
	return r.inner.IsSubscribed(ctx, userID, hubID)
}

func (r *PostgresHubSubscriptionRepository) GetUserSubscriptions(ctx context.Context, userID int) ([]*domain.HubSubscription, error) {
	return r.inner.GetUserSubscriptions(ctx, userID)
}

func (r *PostgresHubSubscriptionRepository) GetSubscriberCount(ctx context.Context, hubID int) (int, error) {
	return r.inner.GetSubscriberCount(ctx, hubID)
}

func (r *PostgresHubSubscriptionRepository) GetSubscribedHubIDs(ctx context.Context, userID int) ([]int, error) {
	return r.inner.GetSubscribedHubIDs(ctx, userID)
}

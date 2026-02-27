package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.SubredditSubscriptionRepository = (*PostgresSubredditSubscriptionRepository)(nil)

// PostgresSubredditSubscriptionRepository wraps the model-layer repository.
type PostgresSubredditSubscriptionRepository struct {
	inner *models.SubredditSubscriptionRepository
}

// NewPostgresSubredditSubscriptionRepository constructs the adapter.
func NewPostgresSubredditSubscriptionRepository(pool *pgxpool.Pool) ports.SubredditSubscriptionRepository {
	return &PostgresSubredditSubscriptionRepository{inner: models.NewSubredditSubscriptionRepository(pool)}
}

func (r *PostgresSubredditSubscriptionRepository) Subscribe(ctx context.Context, userID int, subredditName string) error {
	return r.inner.Subscribe(ctx, userID, subredditName)
}

func (r *PostgresSubredditSubscriptionRepository) Unsubscribe(ctx context.Context, userID int, subredditName string) error {
	return r.inner.Unsubscribe(ctx, userID, subredditName)
}

func (r *PostgresSubredditSubscriptionRepository) IsSubscribed(ctx context.Context, userID int, subredditName string) (bool, error) {
	return r.inner.IsSubscribed(ctx, userID, subredditName)
}

func (r *PostgresSubredditSubscriptionRepository) GetUserSubscriptions(ctx context.Context, userID int) ([]*domain.SubredditSubscription, error) {
	return r.inner.GetUserSubscriptions(ctx, userID)
}

func (r *PostgresSubredditSubscriptionRepository) GetSubscribedSubredditNames(ctx context.Context, userID int) ([]string, error) {
	return r.inner.GetSubscribedSubredditNames(ctx, userID)
}

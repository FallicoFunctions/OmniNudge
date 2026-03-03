package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// SubredditSubscriptionRepository defines the persistence contract for subreddit subscriptions.
type SubredditSubscriptionRepository interface {
	Subscribe(ctx context.Context, userID int, subredditName string) error
	Unsubscribe(ctx context.Context, userID int, subredditName string) error
	IsSubscribed(ctx context.Context, userID int, subredditName string) (bool, error)
	GetUserSubscriptions(ctx context.Context, userID int) ([]*domain.SubredditSubscription, error)
	GetSubscribedSubredditNames(ctx context.Context, userID int) ([]string, error)
}

package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// HubSubscriptionRepository defines the persistence contract for hub subscriptions.
type HubSubscriptionRepository interface {
	Subscribe(ctx context.Context, userID, hubID int) error
	Unsubscribe(ctx context.Context, userID, hubID int) error
	IsSubscribed(ctx context.Context, userID, hubID int) (bool, error)
	GetUserSubscriptions(ctx context.Context, userID int) ([]*domain.HubSubscription, error)
	GetSubscriberCount(ctx context.Context, hubID int) (int, error)
	GetSubscribedHubIDs(ctx context.Context, userID int) ([]int, error)
}

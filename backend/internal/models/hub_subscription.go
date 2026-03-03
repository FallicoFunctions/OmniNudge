package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// HubSubscription represents a user's subscription to a hub
type HubSubscription struct {
	ID           int       `json:"id"`
	UserID       int       `json:"user_id"`
	HubID        int       `json:"hub_id"`
	SubscribedAt time.Time `json:"subscribed_at"`
}

// HubSubscriptionRepository handles hub subscription database operations
type HubSubscriptionRepository struct {
	pool *pgxpool.Pool
}

// NewHubSubscriptionRepository creates a new hub subscription repository
func NewHubSubscriptionRepository(pool *pgxpool.Pool) *HubSubscriptionRepository {
	return &HubSubscriptionRepository{pool: pool}
}

// Subscribe subscribes a user to a hub.
// Uses ON CONFLICT DO NOTHING to handle duplicate subscriptions.
// subscriber_count is maintained by the trg_hub_subscriber_count_inc trigger
// (migration 093); no manual UPDATE is needed here.
func (r *HubSubscriptionRepository) Subscribe(ctx context.Context, userID, hubID int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO hub_subscriptions (user_id, hub_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, hub_id) DO NOTHING
	`, userID, hubID)
	return err
}

// Unsubscribe unsubscribes a user from a hub.
// subscriber_count is maintained by the trg_hub_subscriber_count_dec trigger
// (migration 093); no manual UPDATE is needed here.
func (r *HubSubscriptionRepository) Unsubscribe(ctx context.Context, userID, hubID int) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM hub_subscriptions
		WHERE user_id = $1 AND hub_id = $2
	`, userID, hubID)
	return err
}

// IsSubscribed checks if a user is subscribed to a hub
func (r *HubSubscriptionRepository) IsSubscribed(ctx context.Context, userID, hubID int) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM hub_subscriptions
			WHERE user_id = $1 AND hub_id = $2
		)
	`, userID, hubID).Scan(&exists)
	return exists, err
}

// GetUserSubscriptions returns all hubs a user is subscribed to
func (r *HubSubscriptionRepository) GetUserSubscriptions(ctx context.Context, userID int) ([]*HubSubscription, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, hub_id, subscribed_at
		FROM hub_subscriptions
		WHERE user_id = $1
		ORDER BY subscribed_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subscriptions []*HubSubscription
	for rows.Next() {
		sub := &HubSubscription{}
		err := rows.Scan(&sub.ID, &sub.UserID, &sub.HubID, &sub.SubscribedAt)
		if err != nil {
			return nil, err
		}
		subscriptions = append(subscriptions, sub)
	}

	return subscriptions, rows.Err()
}

// GetSubscriberCount returns the number of subscribers for a hub
func (r *HubSubscriptionRepository) GetSubscriberCount(ctx context.Context, hubID int) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM hub_subscriptions
		WHERE hub_id = $1
	`, hubID).Scan(&count)
	return count, err
}

// GetSubscribedHubIDs returns a list of hub IDs that a user is subscribed to
// Useful for filtering feeds
func (r *HubSubscriptionRepository) GetSubscribedHubIDs(ctx context.Context, userID int) ([]int, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT hub_id
		FROM hub_subscriptions
		WHERE user_id = $1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hubIDs []int
	for rows.Next() {
		var hubID int
		if err := rows.Scan(&hubID); err != nil {
			return nil, err
		}
		hubIDs = append(hubIDs, hubID)
	}

	return hubIDs, rows.Err()
}

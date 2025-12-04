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

// Subscribe subscribes a user to a hub
// Uses ON CONFLICT DO NOTHING to handle duplicate subscriptions
// Increments hub subscriber_count atomically
func (r *HubSubscriptionRepository) Subscribe(ctx context.Context, userID, hubID int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Insert subscription (ignore if already exists)
	_, err = tx.Exec(ctx, `
		INSERT INTO hub_subscriptions (user_id, hub_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, hub_id) DO NOTHING
	`, userID, hubID)
	if err != nil {
		return err
	}

	// Increment subscriber count
	_, err = tx.Exec(ctx, `
		UPDATE hubs
		SET subscriber_count = subscriber_count + 1
		WHERE id = $1
		AND NOT EXISTS (
			SELECT 1 FROM hub_subscriptions
			WHERE user_id = $2 AND hub_id = $1
			AND subscribed_at < NOW() - INTERVAL '1 second'
		)
	`, hubID, userID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// Unsubscribe unsubscribes a user from a hub
// Decrements hub subscriber_count atomically
func (r *HubSubscriptionRepository) Unsubscribe(ctx context.Context, userID, hubID int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Delete subscription
	cmdTag, err := tx.Exec(ctx, `
		DELETE FROM hub_subscriptions
		WHERE user_id = $1 AND hub_id = $2
	`, userID, hubID)
	if err != nil {
		return err
	}

	// Only decrement if a row was actually deleted
	if cmdTag.RowsAffected() > 0 {
		_, err = tx.Exec(ctx, `
			UPDATE hubs
			SET subscriber_count = GREATEST(subscriber_count - 1, 0)
			WHERE id = $1
		`, hubID)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
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

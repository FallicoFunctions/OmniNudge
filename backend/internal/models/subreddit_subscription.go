package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SubredditSubscription represents a user's subscription to a subreddit
type SubredditSubscription struct {
	ID            int       `json:"id"`
	UserID        int       `json:"user_id"`
	SubredditName string    `json:"subreddit_name"`
	SubscribedAt  time.Time `json:"subscribed_at"`
}

// SubredditSubscriptionRepository handles subreddit subscription database operations
type SubredditSubscriptionRepository struct {
	pool *pgxpool.Pool
}

// NewSubredditSubscriptionRepository creates a new subreddit subscription repository
func NewSubredditSubscriptionRepository(pool *pgxpool.Pool) *SubredditSubscriptionRepository {
	return &SubredditSubscriptionRepository{pool: pool}
}

// Subscribe subscribes a user to a subreddit
// Uses ON CONFLICT DO NOTHING to handle duplicate subscriptions
func (r *SubredditSubscriptionRepository) Subscribe(ctx context.Context, userID int, subredditName string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO subreddit_subscriptions (user_id, subreddit_name)
		VALUES ($1, $2)
		ON CONFLICT (user_id, subreddit_name) DO NOTHING
	`, userID, subredditName)
	return err
}

// Unsubscribe unsubscribes a user from a subreddit
func (r *SubredditSubscriptionRepository) Unsubscribe(ctx context.Context, userID int, subredditName string) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM subreddit_subscriptions
		WHERE user_id = $1 AND subreddit_name = $2
	`, userID, subredditName)
	return err
}

// IsSubscribed checks if a user is subscribed to a subreddit
func (r *SubredditSubscriptionRepository) IsSubscribed(ctx context.Context, userID int, subredditName string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM subreddit_subscriptions
			WHERE user_id = $1 AND subreddit_name = $2
		)
	`, userID, subredditName).Scan(&exists)
	return exists, err
}

// GetUserSubscriptions returns all subreddits a user is subscribed to
func (r *SubredditSubscriptionRepository) GetUserSubscriptions(ctx context.Context, userID int) ([]*SubredditSubscription, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, subreddit_name, subscribed_at
		FROM subreddit_subscriptions
		WHERE user_id = $1
		ORDER BY subscribed_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subscriptions []*SubredditSubscription
	for rows.Next() {
		sub := &SubredditSubscription{}
		err := rows.Scan(&sub.ID, &sub.UserID, &sub.SubredditName, &sub.SubscribedAt)
		if err != nil {
			return nil, err
		}
		subscriptions = append(subscriptions, sub)
	}

	return subscriptions, rows.Err()
}

// GetSubscribedSubredditNames returns a list of subreddit names that a user is subscribed to
// Useful for filtering feeds
func (r *SubredditSubscriptionRepository) GetSubscribedSubredditNames(ctx context.Context, userID int) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT subreddit_name
		FROM subreddit_subscriptions
		WHERE user_id = $1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}

	return names, rows.Err()
}

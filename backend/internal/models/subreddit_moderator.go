package models

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SubredditModerator links users to moderated subreddits
type SubredditModerator struct {
	ID          int `json:"id"`
	SubredditID int `json:"subreddit_id"`
	UserID      int `json:"user_id"`
}

// SubredditModeratorRepository manages subreddit moderators
type SubredditModeratorRepository struct {
	pool *pgxpool.Pool
}

// NewSubredditModeratorRepository creates a new repo
func NewSubredditModeratorRepository(pool *pgxpool.Pool) *SubredditModeratorRepository {
	return &SubredditModeratorRepository{pool: pool}
}

// AddModerator adds a user as mod for a subreddit
func (r *SubredditModeratorRepository) AddModerator(ctx context.Context, subredditID, userID int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO subreddit_moderators (subreddit_id, user_id)
		VALUES ($1, $2) ON CONFLICT DO NOTHING
	`, subredditID, userID)
	return err
}

// IsModerator checks if user moderates subreddit
func (r *SubredditModeratorRepository) IsModerator(ctx context.Context, subredditID, userID int) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM subreddit_moderators
			WHERE subreddit_id = $1 AND user_id = $2
		)
	`, subredditID, userID).Scan(&exists)
	return exists, err
}

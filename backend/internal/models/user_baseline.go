package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// UserBaseline represents calculated engagement baselines for a user
type UserBaseline struct {
	UserID                 int       `json:"user_id"`
	AvgPostVotesPerHour    float64   `json:"avg_post_votes_per_hour"`
	AvgCommentVotesPerHour float64   `json:"avg_comment_votes_per_hour"`
	TotalPosts             int       `json:"total_posts"`
	TotalComments          int       `json:"total_comments"`
	LastCalculatedAt       time.Time `json:"last_calculated_at"`
}

// UserBaselineRepository handles database operations for user baselines
type UserBaselineRepository struct {
	pool *pgxpool.Pool
}

// NewUserBaselineRepository creates a new user baseline repository
func NewUserBaselineRepository(pool *pgxpool.Pool) *UserBaselineRepository {
	return &UserBaselineRepository{pool: pool}
}

// GetByUserID retrieves the baseline for a specific user
func (r *UserBaselineRepository) GetByUserID(ctx context.Context, userID int) (*UserBaseline, error) {
	query := `
		SELECT
			user_id, avg_post_votes_per_hour, avg_comment_votes_per_hour,
			total_posts, total_comments, last_calculated_at
		FROM user_activity_baselines
		WHERE user_id = $1
	`

	baseline := &UserBaseline{}
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&baseline.UserID,
		&baseline.AvgPostVotesPerHour,
		&baseline.AvgCommentVotesPerHour,
		&baseline.TotalPosts,
		&baseline.TotalComments,
		&baseline.LastCalculatedAt,
	)

	if err != nil {
		return nil, err
	}

	return baseline, nil
}

// CreateOrUpdate creates or updates a user's baseline
func (r *UserBaselineRepository) CreateOrUpdate(ctx context.Context, baseline *UserBaseline) error {
	query := `
		INSERT INTO user_activity_baselines (
			user_id, avg_post_votes_per_hour, avg_comment_votes_per_hour,
			total_posts, total_comments, last_calculated_at
		) VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (user_id) DO UPDATE SET
			avg_post_votes_per_hour = EXCLUDED.avg_post_votes_per_hour,
			avg_comment_votes_per_hour = EXCLUDED.avg_comment_votes_per_hour,
			total_posts = EXCLUDED.total_posts,
			total_comments = EXCLUDED.total_comments,
			last_calculated_at = EXCLUDED.last_calculated_at
	`

	_, err := r.pool.Exec(
		ctx, query,
		baseline.UserID,
		baseline.AvgPostVotesPerHour,
		baseline.AvgCommentVotesPerHour,
		baseline.TotalPosts,
		baseline.TotalComments,
		baseline.LastCalculatedAt,
	)

	return err
}

// IsNewUser determines if a user is "new" based on their post/comment count
// New users are defined as having fewer than 10 total posts + comments
func (r *UserBaselineRepository) IsNewUser(ctx context.Context, userID int) (bool, error) {
	query := `
		SELECT COALESCE(
			(SELECT (total_posts + total_comments) < 10
			 FROM user_activity_baselines
			 WHERE user_id = $1),
			true
		)
	`

	var isNew bool
	err := r.pool.QueryRow(ctx, query, userID).Scan(&isNew)
	return isNew, err
}

// GetExperienceLevel returns the experience level of a user
// Returns: "new" (0-50), "regular" (51-500), or "power" (500+)
func (r *UserBaselineRepository) GetExperienceLevel(ctx context.Context, userID int) (string, error) {
	query := `
		SELECT COALESCE(total_posts, 0) + COALESCE(total_comments, 0)
		FROM user_activity_baselines
		WHERE user_id = $1
	`

	var totalContent int
	err := r.pool.QueryRow(ctx, query, userID).Scan(&totalContent)
	if err != nil {
		// User not in baseline table yet, treat as new
		return "new", nil
	}

	if totalContent <= 50 {
		return "new", nil
	} else if totalContent <= 500 {
		return "regular", nil
	}
	return "power", nil
}

// GetAllStaleBaselines retrieves all baselines that haven't been updated in the last 24 hours
func (r *UserBaselineRepository) GetAllStaleBaselines(ctx context.Context) ([]*UserBaseline, error) {
	query := `
		SELECT
			user_id, avg_post_votes_per_hour, avg_comment_votes_per_hour,
			total_posts, total_comments, last_calculated_at
		FROM user_activity_baselines
		WHERE last_calculated_at < NOW() - INTERVAL '24 hours'
		ORDER BY last_calculated_at ASC
		LIMIT 1000
	`

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var baselines []*UserBaseline
	for rows.Next() {
		b := &UserBaseline{}
		err := rows.Scan(
			&b.UserID,
			&b.AvgPostVotesPerHour,
			&b.AvgCommentVotesPerHour,
			&b.TotalPosts,
			&b.TotalComments,
			&b.LastCalculatedAt,
		)
		if err != nil {
			return nil, err
		}
		baselines = append(baselines, b)
	}

	return baselines, rows.Err()
}

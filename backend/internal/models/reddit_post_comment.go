package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RedditPostComment represents a comment on a Reddit post (stored locally on your platform)
type RedditPostComment struct {
	ID              int        `json:"id"`
	Subreddit       string     `json:"subreddit"`
	RedditPostID    string     `json:"reddit_post_id"`
	RedditPostTitle *string    `json:"reddit_post_title,omitempty"`
	UserID          int        `json:"user_id"`
	Username        string     `json:"username"`
	ParentCommentID *int       `json:"parent_comment_id"`
	Content         string     `json:"content"`
	Score           int        `json:"score"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       *time.Time `json:"updated_at,omitempty"`
	DeletedAt       *time.Time `json:"deleted_at,omitempty"`
}

// RedditPostCommentRepository manages local comments on Reddit posts
type RedditPostCommentRepository struct {
	pool *pgxpool.Pool
}

// NewRedditPostCommentRepository creates a new RedditPostCommentRepository
func NewRedditPostCommentRepository(pool *pgxpool.Pool) *RedditPostCommentRepository {
	return &RedditPostCommentRepository{pool: pool}
}

// Create creates a new comment on a Reddit post
func (r *RedditPostCommentRepository) Create(ctx context.Context, comment *RedditPostComment) error {
	query := `
		INSERT INTO reddit_post_comments (
			subreddit, reddit_post_id, reddit_post_title, user_id, parent_comment_id, content
		) VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at, score
	`
	return r.pool.QueryRow(ctx, query,
		comment.Subreddit,
		comment.RedditPostID,
		comment.RedditPostTitle,
		comment.UserID,
		comment.ParentCommentID,
		comment.Content,
	).Scan(&comment.ID, &comment.CreatedAt, &comment.Score)
}

// GetByRedditPost retrieves all comments for a specific Reddit post
func (r *RedditPostCommentRepository) GetByRedditPost(ctx context.Context, subreddit, postID string) ([]*RedditPostComment, error) {
	query := `
		SELECT
			rc.id, rc.subreddit, rc.reddit_post_id, rc.reddit_post_title, rc.user_id, u.username,
			rc.parent_comment_id, rc.content, rc.score, rc.created_at, rc.updated_at, rc.deleted_at
		FROM reddit_post_comments rc
		JOIN users u ON u.id = rc.user_id
		WHERE rc.subreddit = $1 AND rc.reddit_post_id = $2 AND rc.deleted_at IS NULL
		ORDER BY rc.created_at ASC
	`
	rows, err := r.pool.Query(ctx, query, subreddit, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*RedditPostComment
	for rows.Next() {
		var comment RedditPostComment
		if err := rows.Scan(
			&comment.ID, &comment.Subreddit, &comment.RedditPostID, &comment.RedditPostTitle,
			&comment.UserID, &comment.Username,
			&comment.ParentCommentID, &comment.Content, &comment.Score,
			&comment.CreatedAt, &comment.UpdatedAt, &comment.DeletedAt,
		); err != nil {
			return nil, err
		}
		comments = append(comments, &comment)
	}
	return comments, rows.Err()
}

// GetByID retrieves a single comment by ID
func (r *RedditPostCommentRepository) GetByID(ctx context.Context, id int) (*RedditPostComment, error) {
	query := `
		SELECT
			rc.id, rc.subreddit, rc.reddit_post_id, rc.reddit_post_title, rc.user_id, u.username,
			rc.parent_comment_id, rc.content, rc.score, rc.created_at, rc.updated_at, rc.deleted_at
		FROM reddit_post_comments rc
		JOIN users u ON u.id = rc.user_id
		WHERE rc.id = $1
	`
	var comment RedditPostComment
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&comment.ID, &comment.Subreddit, &comment.RedditPostID, &comment.RedditPostTitle,
		&comment.UserID, &comment.Username,
		&comment.ParentCommentID, &comment.Content, &comment.Score,
		&comment.CreatedAt, &comment.UpdatedAt, &comment.DeletedAt,
	)
	if err != nil {
		return nil, err
	}
	return &comment, nil
}

// Update updates a comment's content
func (r *RedditPostCommentRepository) Update(ctx context.Context, id int, content string) error {
	query := `
		UPDATE reddit_post_comments
		SET content = $1, updated_at = NOW()
		WHERE id = $2 AND deleted_at IS NULL
	`
	_, err := r.pool.Exec(ctx, query, content, id)
	return err
}

// Delete soft-deletes a comment
func (r *RedditPostCommentRepository) Delete(ctx context.Context, id int) error {
	query := `
		UPDATE reddit_post_comments
		SET deleted_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
	`
	_, err := r.pool.Exec(ctx, query, id)
	return err
}

// Vote updates the score of a comment (for future voting feature)
func (r *RedditPostCommentRepository) Vote(ctx context.Context, id int, delta int) error {
	query := `
		UPDATE reddit_post_comments
		SET score = score + $1
		WHERE id = $2 AND deleted_at IS NULL
	`
	_, err := r.pool.Exec(ctx, query, delta, id)
	return err
}

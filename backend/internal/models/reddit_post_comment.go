package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RedditPostComment represents a comment on a Reddit post (stored locally on your platform)
type RedditPostComment struct {
	ID                      int        `json:"id"`
	Subreddit               string     `json:"subreddit"`
	RedditPostID            string     `json:"reddit_post_id"`
	RedditPostTitle         *string    `json:"reddit_post_title,omitempty"`
	UserID                  int        `json:"user_id"`
	Username                string     `json:"username"`
	ParentCommentID         *int       `json:"parent_comment_id"`
	ParentRedditCommentID   *string    `json:"parent_reddit_comment_id,omitempty"` // Reddit API comment ID this is replying to
	Content                 string     `json:"content"`
	Score                   int        `json:"score"`
	InboxRepliesDisabled    bool       `json:"inbox_replies_disabled"`
	UserVote                *int       `json:"user_vote,omitempty"` // -1, 0, or 1 representing current user's vote
	CreatedAt               time.Time  `json:"created_at"`
	UpdatedAt               *time.Time `json:"updated_at,omitempty"`
	DeletedAt               *time.Time `json:"deleted_at,omitempty"`
}

// RedditPostCommentRepository manages local comments on Reddit posts
type RedditPostCommentRepository struct {
	pool *pgxpool.Pool
}

// NewRedditPostCommentRepository creates a new RedditPostCommentRepository
func NewRedditPostCommentRepository(pool *pgxpool.Pool) *RedditPostCommentRepository {
	return &RedditPostCommentRepository{pool: pool}
}

// SanitizeDeletedPlaceholder ensures deleted comments display placeholder metadata
func (c *RedditPostComment) SanitizeDeletedPlaceholder() {
	if c == nil {
		return
	}
	if c.DeletedAt != nil || c.Content == DeletedCommentPlaceholder {
		c.Content = DeletedCommentPlaceholder
		c.Username = DeletedCommentPlaceholder
	}
}

// Create creates a new comment on a Reddit post and auto-upvotes it
func (r *RedditPostCommentRepository) Create(ctx context.Context, comment *RedditPostComment) error {
	// Start transaction
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Insert comment with score of 1 (auto-upvoted)
	query := `
		INSERT INTO reddit_post_comments (
			subreddit, reddit_post_id, reddit_post_title, user_id, parent_comment_id, parent_reddit_comment_id, content, score
		) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
		RETURNING id, created_at, score, inbox_replies_disabled
	`
	err = tx.QueryRow(ctx, query,
		comment.Subreddit,
		comment.RedditPostID,
		comment.RedditPostTitle,
		comment.UserID,
		comment.ParentCommentID,
		comment.ParentRedditCommentID,
		comment.Content,
	).Scan(&comment.ID, &comment.CreatedAt, &comment.Score, &comment.InboxRepliesDisabled)
	if err != nil {
		return err
	}

	// Auto-upvote the comment
	_, err = tx.Exec(ctx,
		`INSERT INTO reddit_comment_votes (comment_id, user_id, vote_type) VALUES ($1, $2, 1)`,
		comment.ID, comment.UserID,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetByRedditPostWithUserVotes retrieves all comments for a specific Reddit post including the user's votes
func (r *RedditPostCommentRepository) GetByRedditPostWithUserVotes(ctx context.Context, subreddit, postID string, userID int) ([]*RedditPostComment, error) {
	query := `
		SELECT
			rc.id, rc.subreddit, rc.reddit_post_id, rc.reddit_post_title, rc.user_id, u.username,
			rc.parent_comment_id, rc.parent_reddit_comment_id, rc.content, rc.score, rc.inbox_replies_disabled,
			rc.created_at, rc.updated_at, rc.deleted_at,
			COALESCE(v.vote_type, 0) as user_vote
		FROM reddit_post_comments rc
		JOIN users u ON u.id = rc.user_id
		LEFT JOIN reddit_comment_votes v ON v.comment_id = rc.id AND v.user_id = $3
		WHERE rc.subreddit = $1 AND rc.reddit_post_id = $2 AND (rc.deleted_at IS NULL OR rc.content = $4)
		ORDER BY rc.created_at ASC
	`
	rows, err := r.pool.Query(ctx, query, subreddit, postID, userID, DeletedCommentPlaceholder)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*RedditPostComment
	for rows.Next() {
		var comment RedditPostComment
		var userVote int
		if err := rows.Scan(
			&comment.ID, &comment.Subreddit, &comment.RedditPostID, &comment.RedditPostTitle,
			&comment.UserID, &comment.Username,
			&comment.ParentCommentID, &comment.ParentRedditCommentID, &comment.Content, &comment.Score, &comment.InboxRepliesDisabled,
			&comment.CreatedAt, &comment.UpdatedAt, &comment.DeletedAt,
			&userVote,
		); err != nil {
			return nil, err
		}
		userVoteCopy := userVote
		comment.UserVote = &userVoteCopy
		comments = append(comments, &comment)
	}
	return comments, rows.Err()
}

// GetByRedditPost retrieves all comments for a specific Reddit post
func (r *RedditPostCommentRepository) GetByRedditPost(ctx context.Context, subreddit, postID string) ([]*RedditPostComment, error) {
	query := `
		SELECT
			rc.id, rc.subreddit, rc.reddit_post_id, rc.reddit_post_title, rc.user_id, u.username,
			rc.parent_comment_id, rc.parent_reddit_comment_id, rc.content, rc.score, rc.inbox_replies_disabled,
			rc.created_at, rc.updated_at, rc.deleted_at
		FROM reddit_post_comments rc
		JOIN users u ON u.id = rc.user_id
		WHERE rc.subreddit = $1 AND rc.reddit_post_id = $2 AND (rc.deleted_at IS NULL OR rc.content = $3)
		ORDER BY rc.created_at ASC
	`
	rows, err := r.pool.Query(ctx, query, subreddit, postID, DeletedCommentPlaceholder)
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
			&comment.ParentCommentID, &comment.ParentRedditCommentID, &comment.Content, &comment.Score, &comment.InboxRepliesDisabled,
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
			rc.parent_comment_id, rc.parent_reddit_comment_id, rc.content, rc.score, rc.inbox_replies_disabled,
			rc.created_at, rc.updated_at, rc.deleted_at
		FROM reddit_post_comments rc
		JOIN users u ON u.id = rc.user_id
		WHERE rc.id = $1
	`
	var comment RedditPostComment
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&comment.ID, &comment.Subreddit, &comment.RedditPostID, &comment.RedditPostTitle,
		&comment.UserID, &comment.Username,
		&comment.ParentCommentID, &comment.ParentRedditCommentID, &comment.Content, &comment.Score, &comment.InboxRepliesDisabled,
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

// SetInboxRepliesDisabled toggles inbox reply notifications for a comment owner
func (r *RedditPostCommentRepository) SetInboxRepliesDisabled(ctx context.Context, id int, userID int, disabled bool) error {
	query := `
		UPDATE reddit_post_comments
		SET inbox_replies_disabled = $1, updated_at = NOW()
		WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
	`
	_, err := r.pool.Exec(ctx, query, disabled, id, userID)
	return err
}

// Delete soft-deletes a comment
func (r *RedditPostCommentRepository) Delete(ctx context.Context, id int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var childCount int
	err = tx.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM reddit_post_comments
		WHERE parent_comment_id = $1 AND (deleted_at IS NULL OR content = $2)
	`, id, DeletedCommentPlaceholder).Scan(&childCount)
	if err != nil {
		return err
	}

	if childCount > 0 {
		_, err = tx.Exec(ctx, `
			UPDATE reddit_post_comments
			SET content = $2, deleted_at = COALESCE(deleted_at, NOW()), updated_at = NOW()
			WHERE id = $1
		`, id, DeletedCommentPlaceholder)
	} else {
		_, err = tx.Exec(ctx, `DELETE FROM reddit_post_comments WHERE id = $1`, id)
	}
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetUserVote returns the user's vote on a comment (-1, 0, or 1)
func (r *RedditPostCommentRepository) GetUserVote(ctx context.Context, commentID, userID int) (int, error) {
	query := `SELECT vote_type FROM reddit_comment_votes WHERE comment_id = $1 AND user_id = $2`
	var voteType int
	err := r.pool.QueryRow(ctx, query, commentID, userID).Scan(&voteType)
	if err != nil {
		// No vote found
		if err.Error() == "no rows in result set" {
			return 0, nil
		}
		return 0, err
	}
	return voteType, nil
}

// SetVote sets or updates a user's vote on a comment
// voteType should be -1 (downvote), 0 (remove vote), or 1 (upvote)
func (r *RedditPostCommentRepository) SetVote(ctx context.Context, commentID, userID, voteType int) error {
	// Start transaction
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Get current vote if exists
	var currentVote int
	err = tx.QueryRow(ctx,
		`SELECT vote_type FROM reddit_comment_votes WHERE comment_id = $1 AND user_id = $2`,
		commentID, userID,
	).Scan(&currentVote)

	hasVote := err == nil

	if voteType == 0 {
		// Remove vote
		if hasVote {
			_, err = tx.Exec(ctx,
				`DELETE FROM reddit_comment_votes WHERE comment_id = $1 AND user_id = $2`,
				commentID, userID,
			)
			if err != nil {
				return err
			}

			// Update score
			_, err = tx.Exec(ctx,
				`UPDATE reddit_post_comments SET score = score - $1 WHERE id = $2`,
				currentVote, commentID,
			)
			if err != nil {
				return err
			}
		}
	} else {
		// Add or update vote
		scoreDelta := voteType
		if hasVote {
			scoreDelta = voteType - currentVote

			_, err = tx.Exec(ctx,
				`UPDATE reddit_comment_votes SET vote_type = $1, updated_at = NOW()
				 WHERE comment_id = $2 AND user_id = $3`,
				voteType, commentID, userID,
			)
		} else {
			_, err = tx.Exec(ctx,
				`INSERT INTO reddit_comment_votes (comment_id, user_id, vote_type) VALUES ($1, $2, $3)`,
				commentID, userID, voteType,
			)
		}
		if err != nil {
			return err
		}

		// Update score
		if scoreDelta != 0 {
			_, err = tx.Exec(ctx,
				`UPDATE reddit_post_comments SET score = score + $1 WHERE id = $2`,
				scoreDelta, commentID,
			)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

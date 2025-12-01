package models

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const DeletedCommentPlaceholder = "[DELETED]"

// PostComment represents a comment on a platform post
type PostComment struct {
	ID              int    `json:"id"`
	PostID          int    `json:"post_id"`
	UserID          int    `json:"user_id"`
	User            *User  `json:"user,omitempty"` // Optional populated user info
	Username        string `json:"username"`
	ParentCommentID *int   `json:"parent_comment_id,omitempty"`

	// Comment content
	Body string `json:"content"`

	// Engagement metrics
	Score     int `json:"score"`
	Upvotes   int `json:"upvotes"`
	Downvotes int `json:"downvotes"`

	// Status
	IsDeleted            bool       `json:"is_deleted"`
	IsEdited             bool       `json:"is_edited"`
	EditedAt             *time.Time `json:"edited_at,omitempty"`
	InboxRepliesDisabled bool       `json:"inbox_replies_disabled"`
	UserVote             *int       `json:"user_vote,omitempty"`

	// Threading
	Depth int `json:"depth"`

	// Timestamps
	CreatedAt time.Time `json:"created_at"`
}

// PostCommentRepository handles database operations for post comments
type PostCommentRepository struct {
	pool *pgxpool.Pool
}

// NewPostCommentRepository creates a new post comment repository
func NewPostCommentRepository(pool *pgxpool.Pool) *PostCommentRepository {
	return &PostCommentRepository{pool: pool}
}

// SanitizeDeletedPlaceholder ensures deleted comments expose placeholders
func (c *PostComment) SanitizeDeletedPlaceholder() {
	if c == nil {
		return
	}
	if c.IsDeleted || c.Body == DeletedCommentPlaceholder {
		c.Body = DeletedCommentPlaceholder
		c.Username = DeletedCommentPlaceholder
		c.User = nil
	}
}

// Create creates a new comment on a platform post
func (r *PostCommentRepository) Create(ctx context.Context, comment *PostComment) error {
	// Calculate depth based on parent comment
	var depth int
	if comment.ParentCommentID != nil {
		var parentDepth int
		err := r.pool.QueryRow(ctx, "SELECT depth FROM post_comments WHERE id = $1", *comment.ParentCommentID).Scan(&parentDepth)
		if err != nil {
			return err
		}
		depth = parentDepth + 1
		// Max depth limit
		if depth > 10 {
			depth = 10
		}
	}

	query := `
		INSERT INTO post_comments (post_id, user_id, parent_comment_id, body, depth)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, score, upvotes, downvotes, is_deleted, is_edited, edited_at, created_at, inbox_replies_disabled
	`

	err := r.pool.QueryRow(ctx, query,
		comment.PostID,
		comment.UserID,
		comment.ParentCommentID,
		comment.Body,
		depth,
	).Scan(
		&comment.ID,
		&comment.Score,
		&comment.Upvotes,
		&comment.Downvotes,
		&comment.IsDeleted,
		&comment.IsEdited,
		&comment.EditedAt,
		&comment.CreatedAt,
		&comment.InboxRepliesDisabled,
	)

	if err != nil {
		return err
	}

	comment.Depth = depth

	// Increment comment count on post
	_, err = r.pool.Exec(ctx, "UPDATE platform_posts SET num_comments = num_comments + 1 WHERE id = $1", comment.PostID)
	return err
}

// GetByID retrieves a comment by its ID
func (r *PostCommentRepository) GetByID(ctx context.Context, id int) (*PostComment, error) {
	comment := &PostComment{}

	query := `
		SELECT pc.id, pc.post_id, pc.user_id, u.username,
		       pc.parent_comment_id, pc.body, pc.score, pc.upvotes, pc.downvotes,
		       pc.is_deleted, pc.is_edited, pc.edited_at, pc.depth, pc.created_at,
		       pc.inbox_replies_disabled
		FROM post_comments pc
		JOIN users u ON u.id = pc.user_id
		WHERE pc.id = $1 AND (pc.is_deleted = FALSE OR pc.body = $2)
	`

	err := r.pool.QueryRow(ctx, query, id, DeletedCommentPlaceholder).Scan(
		&comment.ID,
		&comment.PostID,
		&comment.UserID,
		&comment.Username,
		&comment.ParentCommentID,
		&comment.Body,
		&comment.Score,
		&comment.Upvotes,
		&comment.Downvotes,
		&comment.IsDeleted,
		&comment.IsEdited,
		&comment.EditedAt,
		&comment.Depth,
		&comment.CreatedAt,
		&comment.InboxRepliesDisabled,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	comment.SanitizeDeletedPlaceholder()
	return comment, nil
}

// GetByPostID retrieves all top-level comments for a post
func (r *PostCommentRepository) GetByPostID(ctx context.Context, postID int, sortBy string, limit, offset int, userID *int) ([]*PostComment, error) {
	var orderClause string
	switch sortBy {
	case "top", "best":
		orderClause = "ORDER BY score DESC, created_at DESC"
	case "new":
		orderClause = "ORDER BY created_at DESC"
	case "old":
		orderClause = "ORDER BY created_at ASC"
	default:
		orderClause = "ORDER BY score DESC, created_at DESC"
	}

	args := []interface{}{postID, limit, offset, DeletedCommentPlaceholder}
	var query string
	if userID != nil {
		query = `
			SELECT pc.id, pc.post_id, pc.user_id, u.username,
			       pc.parent_comment_id, pc.body, pc.score, pc.upvotes, pc.downvotes,
			       pc.is_deleted, pc.is_edited, pc.edited_at, pc.depth, pc.created_at,
			       pc.inbox_replies_disabled,
			       CASE
			           WHEN cv.comment_id IS NULL THEN 0
			           WHEN cv.is_upvote THEN 1
			           ELSE -1
			       END AS user_vote
			FROM post_comments pc
			JOIN users u ON u.id = pc.user_id
			LEFT JOIN comment_votes cv ON cv.comment_id = pc.id AND cv.user_id = $5
			WHERE pc.post_id = $1 AND (pc.is_deleted = FALSE OR pc.body = $4)
			` + orderClause + `
			LIMIT $2 OFFSET $3
		`
		args = append(args, *userID)
	} else {
		query = `
			SELECT pc.id, pc.post_id, pc.user_id, u.username,
			       pc.parent_comment_id, pc.body, pc.score, pc.upvotes, pc.downvotes,
			       pc.is_deleted, pc.is_edited, pc.edited_at, pc.depth, pc.created_at,
			       pc.inbox_replies_disabled,
			       0 AS user_vote
			FROM post_comments pc
			JOIN users u ON u.id = pc.user_id
			WHERE pc.post_id = $1 AND (pc.is_deleted = FALSE OR pc.body = $4)
			` + orderClause + `
			LIMIT $2 OFFSET $3
		`
	}

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*PostComment
	for rows.Next() {
		comment := &PostComment{}
		var userVote int
		err := rows.Scan(
			&comment.ID,
			&comment.PostID,
			&comment.UserID,
			&comment.Username,
			&comment.ParentCommentID,
			&comment.Body,
			&comment.Score,
			&comment.Upvotes,
			&comment.Downvotes,
			&comment.IsDeleted,
			&comment.IsEdited,
			&comment.EditedAt,
			&comment.Depth,
			&comment.CreatedAt,
			&comment.InboxRepliesDisabled,
			&userVote,
		)
		if err != nil {
			return nil, err
		}
		if userID != nil {
			v := userVote
			comment.UserVote = &v
		}
		comment.SanitizeDeletedPlaceholder()
		comments = append(comments, comment)
	}

	return comments, rows.Err()
}

// GetReplies retrieves all replies to a specific comment
func (r *PostCommentRepository) GetReplies(ctx context.Context, parentCommentID int, sortBy string, limit, offset int, userID *int) ([]*PostComment, error) {
	var orderClause string
	switch sortBy {
	case "top", "best":
		orderClause = "ORDER BY score DESC, created_at DESC"
	case "new":
		orderClause = "ORDER BY created_at DESC"
	case "old":
		orderClause = "ORDER BY created_at ASC"
	default:
		orderClause = "ORDER BY score DESC, created_at DESC"
	}

	args := []interface{}{parentCommentID, limit, offset, DeletedCommentPlaceholder}
	var query string
	if userID != nil {
		query = `
			SELECT pc.id, pc.post_id, pc.user_id, u.username,
			       pc.parent_comment_id, pc.body, pc.score, pc.upvotes, pc.downvotes,
			       pc.is_deleted, pc.is_edited, pc.edited_at, pc.depth, pc.created_at,
			       pc.inbox_replies_disabled,
			       CASE
			           WHEN cv.comment_id IS NULL THEN 0
			           WHEN cv.is_upvote THEN 1
			           ELSE -1
			       END AS user_vote
			FROM post_comments pc
			JOIN users u ON u.id = pc.user_id
			LEFT JOIN comment_votes cv ON cv.comment_id = pc.id AND cv.user_id = $5
			WHERE pc.parent_comment_id = $1 AND (pc.is_deleted = FALSE OR pc.body = $4)
			` + orderClause + `
			LIMIT $2 OFFSET $3
		`
		args = append(args, *userID)
	} else {
		query = `
			SELECT pc.id, pc.post_id, pc.user_id, u.username,
			       pc.parent_comment_id, pc.body, pc.score, pc.upvotes, pc.downvotes,
			       pc.is_deleted, pc.is_edited, pc.edited_at, pc.depth, pc.created_at,
			       pc.inbox_replies_disabled,
			       0 AS user_vote
			FROM post_comments pc
			JOIN users u ON u.id = pc.user_id
			WHERE pc.parent_comment_id = $1 AND (pc.is_deleted = FALSE OR pc.body = $4)
			` + orderClause + `
			LIMIT $2 OFFSET $3
		`
	}

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*PostComment
	for rows.Next() {
		comment := &PostComment{}
		var userVote int
		err := rows.Scan(
			&comment.ID,
			&comment.PostID,
			&comment.UserID,
			&comment.Username,
			&comment.ParentCommentID,
			&comment.Body,
			&comment.Score,
			&comment.Upvotes,
			&comment.Downvotes,
			&comment.IsDeleted,
			&comment.IsEdited,
			&comment.EditedAt,
			&comment.Depth,
			&comment.CreatedAt,
			&comment.InboxRepliesDisabled,
			&userVote,
		)
		if err != nil {
			return nil, err
		}
		if userID != nil {
			v := userVote
			comment.UserVote = &v
		}
		comment.SanitizeDeletedPlaceholder()
		comments = append(comments, comment)
	}

	return comments, rows.Err()
}

// GetByUserID retrieves comments by a specific user
func (r *PostCommentRepository) GetByUserID(ctx context.Context, userID int, limit, offset int) ([]*PostComment, error) {
	query := `
		SELECT id, post_id, user_id, parent_comment_id, body, score, upvotes, downvotes,
		       is_deleted, is_edited, edited_at, depth, created_at
		FROM post_comments
		WHERE user_id = $1 AND is_deleted = FALSE
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*PostComment
	for rows.Next() {
		comment := &PostComment{}
		err := rows.Scan(
			&comment.ID,
			&comment.PostID,
			&comment.UserID,
			&comment.ParentCommentID,
			&comment.Body,
			&comment.Score,
			&comment.Upvotes,
			&comment.Downvotes,
			&comment.IsDeleted,
			&comment.IsEdited,
			&comment.EditedAt,
			&comment.Depth,
			&comment.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		comments = append(comments, comment)
	}

	return comments, rows.Err()
}

// Update updates a comment's content
func (r *PostCommentRepository) Update(ctx context.Context, comment *PostComment) error {
	query := `
		UPDATE post_comments
		SET body = $1, is_edited = TRUE, edited_at = CURRENT_TIMESTAMP
		WHERE id = $2 AND is_deleted = FALSE
		RETURNING edited_at
	`

	return r.pool.QueryRow(ctx, query, comment.Body, comment.ID).Scan(&comment.EditedAt)
}

// SetInboxRepliesDisabled toggles inbox reply notifications for a comment
func (r *PostCommentRepository) SetInboxRepliesDisabled(ctx context.Context, commentID, userID int, disabled bool) error {
	query := `
		UPDATE post_comments
		SET inbox_replies_disabled = $1, edited_at = CURRENT_TIMESTAMP
		WHERE id = $2 AND user_id = $3
	`
	_, err := r.pool.Exec(ctx, query, disabled, commentID, userID)
	return err
}

// SoftDelete marks a comment as deleted
func (r *PostCommentRepository) SoftDelete(ctx context.Context, commentID int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var postID int
	err = tx.QueryRow(ctx, "SELECT post_id FROM post_comments WHERE id = $1 FOR UPDATE", commentID).Scan(&postID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return err
	}

	var replyCount int
	err = tx.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM post_comments
		WHERE parent_comment_id = $1 AND (is_deleted = FALSE OR body = $2)
	`, commentID, DeletedCommentPlaceholder).Scan(&replyCount)
	if err != nil {
		return err
	}

	if replyCount > 0 {
		_, err = tx.Exec(ctx, `
			UPDATE post_comments
			SET body = $2,
			    is_deleted = TRUE,
			    edited_at = COALESCE(edited_at, CURRENT_TIMESTAMP)
			WHERE id = $1
		`, commentID, DeletedCommentPlaceholder)
		if err != nil {
			return err
		}
	} else {
		if _, err = tx.Exec(ctx, `DELETE FROM post_comments WHERE id = $1`, commentID); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `UPDATE platform_posts SET num_comments = GREATEST(num_comments - 1, 0) WHERE id = $1`, postID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// Vote records a user's vote and updates aggregate counts, preventing duplicates.
// isUpvote: true (upvote), false (downvote), nil (remove vote)
func (r *PostCommentRepository) Vote(ctx context.Context, commentID int, userID int, isUpvote *bool) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var existingIsUpvote bool
	err = tx.QueryRow(ctx, "SELECT is_upvote FROM comment_votes WHERE comment_id = $1 AND user_id = $2", commentID, userID).Scan(&existingIsUpvote)
	if err != nil && err != pgx.ErrNoRows {
		return err
	}

	switch {
	case err == pgx.ErrNoRows:
		// New vote
		if isUpvote == nil {
			return tx.Commit(ctx)
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO comment_votes (comment_id, user_id, is_upvote)
			VALUES ($1, $2, $3)
		`, commentID, userID, *isUpvote); err != nil {
			return err
		}

		if *isUpvote {
			if _, err := tx.Exec(ctx, `
				UPDATE post_comments
				SET upvotes = upvotes + 1, score = score + 1
				WHERE id = $1
			`, commentID); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `
				UPDATE post_comments
				SET downvotes = downvotes + 1, score = score - 1
				WHERE id = $1
			`, commentID); err != nil {
				return err
			}
		}
	case isUpvote == nil:
		// Remove existing vote
		if _, err := tx.Exec(ctx, `DELETE FROM comment_votes WHERE comment_id = $1 AND user_id = $2`, commentID, userID); err != nil {
			return err
		}
		if existingIsUpvote {
			if _, err := tx.Exec(ctx, `
				UPDATE post_comments
				SET upvotes = GREATEST(upvotes - 1, 0),
				    score = score - 1
				WHERE id = $1
			`, commentID); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `
				UPDATE post_comments
				SET downvotes = GREATEST(downvotes - 1, 0),
				    score = score + 1
				WHERE id = $1
			`, commentID); err != nil {
				return err
			}
		}
	case existingIsUpvote == *isUpvote:
		// Duplicate same-direction vote: no-op
		return tx.Commit(ctx)
	default:
		// Toggle vote direction
		if _, err := tx.Exec(ctx, `
			UPDATE comment_votes
			SET is_upvote = $3, created_at = CURRENT_TIMESTAMP
			WHERE comment_id = $1 AND user_id = $2
		`, commentID, userID, *isUpvote); err != nil {
			return err
		}

		if *isUpvote {
			if _, err := tx.Exec(ctx, `
				UPDATE post_comments
				SET upvotes = upvotes + 1,
				    downvotes = GREATEST(downvotes - 1, 0),
				    score = score + 2
				WHERE id = $1
			`, commentID); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `
				UPDATE post_comments
				SET downvotes = downvotes + 1,
				    upvotes = GREATEST(upvotes - 1, 0),
				    score = score - 2
				WHERE id = $1
			`, commentID); err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

// GetReplyCount returns the number of replies to a comment
func (r *PostCommentRepository) GetReplyCount(ctx context.Context, commentID int) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM post_comments WHERE parent_comment_id = $1 AND (is_deleted = FALSE OR body = $2)`
	err := r.pool.QueryRow(ctx, query, commentID, DeletedCommentPlaceholder).Scan(&count)
	return count, err
}

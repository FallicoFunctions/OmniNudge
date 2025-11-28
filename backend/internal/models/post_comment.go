package models

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PostComment represents a comment on a platform post
type PostComment struct {
	ID              int        `json:"id"`
	PostID          int        `json:"post_id"`
	UserID          int        `json:"user_id"`
	User            *User      `json:"user,omitempty"` // Optional populated user info
	ParentCommentID *int       `json:"parent_comment_id,omitempty"`

	// Comment content
	Body string `json:"body"`

	// Engagement metrics
	Score     int `json:"score"`
	Upvotes   int `json:"upvotes"`
	Downvotes int `json:"downvotes"`

	// Status
	IsDeleted bool       `json:"is_deleted"`
	IsEdited  bool       `json:"is_edited"`
	EditedAt  *time.Time `json:"edited_at,omitempty"`

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
		RETURNING id, score, upvotes, downvotes, is_deleted, is_edited, edited_at, created_at
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
		SELECT id, post_id, user_id, parent_comment_id, body, score, upvotes, downvotes,
		       is_deleted, is_edited, edited_at, depth, created_at
		FROM post_comments
		WHERE id = $1 AND is_deleted = FALSE
	`

	err := r.pool.QueryRow(ctx, query, id).Scan(
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
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return comment, nil
}

// GetByPostID retrieves all top-level comments for a post
func (r *PostCommentRepository) GetByPostID(ctx context.Context, postID int, sortBy string, limit, offset int) ([]*PostComment, error) {
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

	query := `
		SELECT id, post_id, user_id, parent_comment_id, body, score, upvotes, downvotes,
		       is_deleted, is_edited, edited_at, depth, created_at
		FROM post_comments
		WHERE post_id = $1 AND parent_comment_id IS NULL AND is_deleted = FALSE
		` + orderClause + `
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, postID, limit, offset)
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

// GetReplies retrieves all replies to a specific comment
func (r *PostCommentRepository) GetReplies(ctx context.Context, parentCommentID int, sortBy string, limit, offset int) ([]*PostComment, error) {
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

	query := `
		SELECT id, post_id, user_id, parent_comment_id, body, score, upvotes, downvotes,
		       is_deleted, is_edited, edited_at, depth, created_at
		FROM post_comments
		WHERE parent_comment_id = $1 AND is_deleted = FALSE
		` + orderClause + `
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, parentCommentID, limit, offset)
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

// SoftDelete marks a comment as deleted
func (r *PostCommentRepository) SoftDelete(ctx context.Context, commentID int) error {
	query := `UPDATE post_comments SET is_deleted = TRUE WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, commentID)
	if err != nil {
		return err
	}

	// Decrement comment count on post
	var postID int
	err = r.pool.QueryRow(ctx, "SELECT post_id FROM post_comments WHERE id = $1", commentID).Scan(&postID)
	if err != nil {
		return err
	}

	_, err = r.pool.Exec(ctx, "UPDATE platform_posts SET num_comments = num_comments - 1 WHERE id = $1", postID)
	return err
}

// Vote updates vote counts and score for a comment
func (r *PostCommentRepository) Vote(ctx context.Context, commentID int, isUpvote bool) error {
	var query string
	if isUpvote {
		query = `
			UPDATE post_comments
			SET upvotes = upvotes + 1, score = score + 1
			WHERE id = $1
		`
	} else {
		query = `
			UPDATE post_comments
			SET downvotes = downvotes + 1, score = score - 1
			WHERE id = $1
		`
	}

	_, err := r.pool.Exec(ctx, query, commentID)
	return err
}

// GetReplyCount returns the number of replies to a comment
func (r *PostCommentRepository) GetReplyCount(ctx context.Context, commentID int) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM post_comments WHERE parent_comment_id = $1 AND is_deleted = FALSE`
	err := r.pool.QueryRow(ctx, query, commentID).Scan(&count)
	return count, err
}

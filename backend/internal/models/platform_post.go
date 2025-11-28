package models

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PlatformPost represents a native post created by users
type PlatformPost struct {
	ID       int    `json:"id"`
	AuthorID int    `json:"author_id"`
	Author   *User  `json:"author,omitempty"` // Optional populated user info

	// Post content
	Title string  `json:"title"`
	Body  *string `json:"body,omitempty"`

	// Categorization
	Tags []string `json:"tags,omitempty"`

	// Media (optional)
	MediaURL     *string `json:"media_url,omitempty"`
	MediaType    *string `json:"media_type,omitempty"`
	ThumbnailURL *string `json:"thumbnail_url,omitempty"`

	// Engagement metrics
	Score       int `json:"score"`
	Upvotes     int `json:"upvotes"`
	Downvotes   int `json:"downvotes"`
	NumComments int `json:"num_comments"`
	ViewCount   int `json:"view_count"`

	// Status
	IsDeleted bool       `json:"is_deleted"`
	IsEdited  bool       `json:"is_edited"`
	EditedAt  *time.Time `json:"edited_at,omitempty"`

	// Timestamps
	CreatedAt time.Time `json:"created_at"`
}

// PlatformPostRepository handles database operations for platform posts
type PlatformPostRepository struct {
	pool *pgxpool.Pool
}

// NewPlatformPostRepository creates a new platform post repository
func NewPlatformPostRepository(pool *pgxpool.Pool) *PlatformPostRepository {
	return &PlatformPostRepository{pool: pool}
}

// Create creates a new platform post
func (r *PlatformPostRepository) Create(ctx context.Context, post *PlatformPost) error {
	query := `
		INSERT INTO platform_posts (author_id, title, body, tags, media_url, media_type, thumbnail_url)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, score, upvotes, downvotes, num_comments, view_count, is_deleted, is_edited, edited_at, created_at
	`

	return r.pool.QueryRow(ctx, query,
		post.AuthorID,
		post.Title,
		post.Body,
		post.Tags,
		post.MediaURL,
		post.MediaType,
		post.ThumbnailURL,
	).Scan(
		&post.ID,
		&post.Score,
		&post.Upvotes,
		&post.Downvotes,
		&post.NumComments,
		&post.ViewCount,
		&post.IsDeleted,
		&post.IsEdited,
		&post.EditedAt,
		&post.CreatedAt,
	)
}

// GetByID retrieves a post by its ID
func (r *PlatformPostRepository) GetByID(ctx context.Context, id int) (*PlatformPost, error) {
	post := &PlatformPost{}

	query := `
		SELECT id, author_id, title, body, tags, media_url, media_type, thumbnail_url,
			   score, upvotes, downvotes, num_comments, view_count,
			   is_deleted, is_edited, edited_at, created_at
		FROM platform_posts
		WHERE id = $1 AND is_deleted = FALSE
	`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&post.ID,
		&post.AuthorID,
		&post.Title,
		&post.Body,
		&post.Tags,
		&post.MediaURL,
		&post.MediaType,
		&post.ThumbnailURL,
		&post.Score,
		&post.Upvotes,
		&post.Downvotes,
		&post.NumComments,
		&post.ViewCount,
		&post.IsDeleted,
		&post.IsEdited,
		&post.EditedAt,
		&post.CreatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return post, nil
}

// GetFeed retrieves a feed of posts ordered by creation time or score
func (r *PlatformPostRepository) GetFeed(ctx context.Context, sortBy string, limit, offset int) ([]*PlatformPost, error) {
	var orderClause string
	switch sortBy {
	case "hot", "score":
		orderClause = "ORDER BY score DESC, created_at DESC"
	case "new":
		orderClause = "ORDER BY created_at DESC"
	default:
		orderClause = "ORDER BY created_at DESC"
	}

	query := `
		SELECT id, author_id, title, body, tags, media_url, media_type, thumbnail_url,
			   score, upvotes, downvotes, num_comments, view_count,
			   is_deleted, is_edited, edited_at, created_at
		FROM platform_posts
		WHERE is_deleted = FALSE
		` + orderClause + `
		LIMIT $1 OFFSET $2
	`

	rows, err := r.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*PlatformPost
	for rows.Next() {
		post := &PlatformPost{}
		err := rows.Scan(
			&post.ID,
			&post.AuthorID,
			&post.Title,
			&post.Body,
			&post.Tags,
			&post.MediaURL,
			&post.MediaType,
			&post.ThumbnailURL,
			&post.Score,
			&post.Upvotes,
			&post.Downvotes,
			&post.NumComments,
			&post.ViewCount,
			&post.IsDeleted,
			&post.IsEdited,
			&post.EditedAt,
			&post.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// GetByAuthor retrieves posts by a specific author
func (r *PlatformPostRepository) GetByAuthor(ctx context.Context, authorID int, limit, offset int) ([]*PlatformPost, error) {
	query := `
		SELECT id, author_id, title, body, tags, media_url, media_type, thumbnail_url,
			   score, upvotes, downvotes, num_comments, view_count,
			   is_deleted, is_edited, edited_at, created_at
		FROM platform_posts
		WHERE author_id = $1 AND is_deleted = FALSE
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, authorID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*PlatformPost
	for rows.Next() {
		post := &PlatformPost{}
		err := rows.Scan(
			&post.ID,
			&post.AuthorID,
			&post.Title,
			&post.Body,
			&post.Tags,
			&post.MediaURL,
			&post.MediaType,
			&post.ThumbnailURL,
			&post.Score,
			&post.Upvotes,
			&post.Downvotes,
			&post.NumComments,
			&post.ViewCount,
			&post.IsDeleted,
			&post.IsEdited,
			&post.EditedAt,
			&post.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// GetByTags retrieves posts that contain any of the specified tags
func (r *PlatformPostRepository) GetByTags(ctx context.Context, tags []string, limit, offset int) ([]*PlatformPost, error) {
	query := `
		SELECT id, author_id, title, body, tags, media_url, media_type, thumbnail_url,
			   score, upvotes, downvotes, num_comments, view_count,
			   is_deleted, is_edited, edited_at, created_at
		FROM platform_posts
		WHERE tags && $1 AND is_deleted = FALSE
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, tags, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*PlatformPost
	for rows.Next() {
		post := &PlatformPost{}
		err := rows.Scan(
			&post.ID,
			&post.AuthorID,
			&post.Title,
			&post.Body,
			&post.Tags,
			&post.MediaURL,
			&post.MediaType,
			&post.ThumbnailURL,
			&post.Score,
			&post.Upvotes,
			&post.Downvotes,
			&post.NumComments,
			&post.ViewCount,
			&post.IsDeleted,
			&post.IsEdited,
			&post.EditedAt,
			&post.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// Update updates a post's content
func (r *PlatformPostRepository) Update(ctx context.Context, post *PlatformPost) error {
	query := `
		UPDATE platform_posts
		SET title = $1, body = $2, tags = $3, media_url = $4, media_type = $5,
		    thumbnail_url = $6, is_edited = TRUE, edited_at = CURRENT_TIMESTAMP
		WHERE id = $7 AND is_deleted = FALSE
		RETURNING edited_at
	`

	return r.pool.QueryRow(ctx, query,
		post.Title,
		post.Body,
		post.Tags,
		post.MediaURL,
		post.MediaType,
		post.ThumbnailURL,
		post.ID,
	).Scan(&post.EditedAt)
}

// SoftDelete marks a post as deleted
func (r *PlatformPostRepository) SoftDelete(ctx context.Context, postID int) error {
	query := `UPDATE platform_posts SET is_deleted = TRUE WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, postID)
	return err
}

// IncrementViewCount increments the view count for a post
func (r *PlatformPostRepository) IncrementViewCount(ctx context.Context, postID int) error {
	query := `UPDATE platform_posts SET view_count = view_count + 1 WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, postID)
	return err
}

// Vote updates vote counts and score for a post
func (r *PlatformPostRepository) Vote(ctx context.Context, postID int, isUpvote bool) error {
	var query string
	if isUpvote {
		query = `
			UPDATE platform_posts
			SET upvotes = upvotes + 1, score = score + 1
			WHERE id = $1
		`
	} else {
		query = `
			UPDATE platform_posts
			SET downvotes = downvotes + 1, score = score - 1
			WHERE id = $1
		`
	}

	_, err := r.pool.Exec(ctx, query, postID)
	return err
}

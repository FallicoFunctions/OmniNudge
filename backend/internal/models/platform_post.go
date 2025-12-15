package models

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PlatformPost represents a native post created by users
type PlatformPost struct {
	ID             int    `json:"id"`
	AuthorID       int    `json:"author_id"`
	Author         *User  `json:"author,omitempty"`   // Optional populated user info
	AuthorUsername string `json:"author_username,omitempty"` // Author's username
	HubID          *int   `json:"hub_id,omitempty"`   // Optional: only set for hub posts
	Hub            *Hub   `json:"hub,omitempty"`
	HubName        string `json:"hub_name,omitempty"`

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
	Score       int     `json:"score"`
	Upvotes     int     `json:"upvotes"`
	Downvotes   int     `json:"downvotes"`
	NumComments int     `json:"num_comments"`
	ViewCount   int     `json:"view_count"`
	HotScore    float64 `json:"hot_score"` // Reddit-style hot ranking score

	// User interaction (only populated when user is authenticated)
	UserVote *int `json:"user_vote,omitempty"` // -1 (downvote), 0 (no vote), 1 (upvote), or null if not authenticated

	// Status
	IsDeleted bool       `json:"is_deleted"`
	IsEdited  bool       `json:"is_edited"`
	EditedAt  *time.Time `json:"edited_at,omitempty"`

	// Crosspost information (if this post is a crosspost)
	CrosspostOriginType      *string `json:"crosspost_origin_type,omitempty"`      // "reddit" or "platform"
	CrosspostOriginSubreddit *string `json:"crosspost_origin_subreddit,omitempty"` // For Reddit crossposts (source subreddit)
	CrosspostOriginPostID    *string `json:"crosspost_origin_post_id,omitempty"`   // Reddit post ID or platform post ID
	CrosspostOriginalTitle   *string `json:"crosspost_original_title,omitempty"`   // Original title before editing

	// Subreddit association (for posts that belong to a subreddit context)
	TargetSubreddit *string `json:"target_subreddit,omitempty"` // Subreddit this post is posted to

	// Timestamps
	CrosspostedAt *time.Time `json:"crossposted_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

const platformPostSelectColumns = `
	id, author_id, hub_id, title, body, tags, media_url, media_type, thumbnail_url,
	score, upvotes, downvotes, num_comments, view_count,
	is_deleted, is_edited, edited_at,
	crosspost_origin_type, crosspost_origin_subreddit, crosspost_origin_post_id, crosspost_original_title,
	target_subreddit, crossposted_at, created_at, hot_score
`

const platformPostSelectColumnsPrefixed = `
	p.id, p.author_id, p.hub_id, p.title, p.body, p.tags, p.media_url, p.media_type, p.thumbnail_url,
	p.score, p.upvotes, p.downvotes, p.num_comments, p.view_count,
	p.is_deleted, p.is_edited, p.edited_at,
	p.crosspost_origin_type, p.crosspost_origin_subreddit, p.crosspost_origin_post_id, p.crosspost_original_title,
	p.target_subreddit, p.crossposted_at, p.created_at, p.hot_score
`

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
		INSERT INTO platform_posts (
			author_id, hub_id, title, body, tags, media_url, media_type, thumbnail_url,
			crosspost_origin_type, crosspost_origin_subreddit, crosspost_origin_post_id, crosspost_original_title,
			target_subreddit, crossposted_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		RETURNING id, score, upvotes, downvotes, num_comments, view_count, is_deleted, is_edited, edited_at, crossposted_at, created_at
	`

	return r.pool.QueryRow(ctx, query,
		post.AuthorID,
		post.HubID,
		post.Title,
		post.Body,
		post.Tags,
		post.MediaURL,
		post.MediaType,
		post.ThumbnailURL,
		post.CrosspostOriginType,
		post.CrosspostOriginSubreddit,
		post.CrosspostOriginPostID,
		post.CrosspostOriginalTitle,
		post.TargetSubreddit,
		post.CrosspostedAt,
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
		&post.CrosspostedAt,
		&post.CreatedAt,
	)
}

// GetByID retrieves a post by its ID
func (r *PlatformPostRepository) GetByID(ctx context.Context, id int) (*PlatformPost, error) {
	post := &PlatformPost{}

	query := `
		SELECT ` + platformPostSelectColumns + `
		FROM platform_posts
		WHERE id = $1 AND is_deleted = FALSE
	`

	err := scanPlatformPost(r.pool.QueryRow(ctx, query, id), post)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return post, nil
}

// GetByIDWithUser retrieves a single post by ID with user vote information
func (r *PlatformPostRepository) GetByIDWithUser(ctx context.Context, id int, userID *int) (*PlatformPost, error) {
	post := &PlatformPost{}

	query := `
		SELECT ` + platformPostSelectColumnsPrefixed + `,
		CASE
			WHEN pv.is_upvote IS NULL THEN NULL
			WHEN pv.is_upvote = TRUE THEN 1
			ELSE -1
		END as user_vote
		FROM platform_posts p
		LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $2
		WHERE p.id = $1 AND p.is_deleted = FALSE
	`

	var err error
	if userID != nil {
		err = scanPlatformPostWithVote(r.pool.QueryRow(ctx, query, id, *userID), post)
	} else {
		err = scanPlatformPostWithVote(r.pool.QueryRow(ctx, query, id, nil), post)
	}

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
		SELECT ` + platformPostSelectColumns + `
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
		if err := scanPlatformPost(rows, post); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// GetByAuthor retrieves posts by a specific author
func (r *PlatformPostRepository) GetByAuthor(ctx context.Context, authorID int, limit, offset int) ([]*PlatformPost, error) {
	query := `
		SELECT ` + platformPostSelectColumns + `
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
		if err := scanPlatformPost(rows, post); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// GetByHub retrieves posts by hub
func (r *PlatformPostRepository) GetByHub(ctx context.Context, hubID int, sortBy string, limit, offset int) ([]*PlatformPost, error) {
	return r.GetByHubWithUser(ctx, hubID, sortBy, limit, offset, nil)
}

// GetByHubWithUser retrieves posts by hub with optional user vote information
func (r *PlatformPostRepository) GetByHubWithUser(ctx context.Context, hubID int, sortBy string, limit, offset int, userID *int) ([]*PlatformPost, error) {
	var orderClause string
	switch sortBy {
	case "hot":
		orderClause = "ORDER BY p.hot_score DESC, p.created_at DESC"
	case "new":
		orderClause = "ORDER BY p.created_at DESC"
	case "top":
		orderClause = "ORDER BY p.score DESC, p.created_at DESC"
	case "rising":
		// Rising sort: score divided by age in hours
		orderClause = `ORDER BY (p.score::float / GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600, 1)) DESC`
	default:
		orderClause = "ORDER BY p.hot_score DESC, p.created_at DESC"
	}

	query := `
		SELECT ` + platformPostSelectColumnsPrefixed + `,
		CASE
			WHEN pv.is_upvote IS NULL THEN NULL
			WHEN pv.is_upvote = TRUE THEN 1
			ELSE -1
		END as user_vote
		FROM platform_posts p
		LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $4
		WHERE p.hub_id = $1 AND p.is_deleted = FALSE AND (p.target_subreddit IS NULL OR p.target_subreddit = '')
		` + orderClause + `
		LIMIT $2 OFFSET $3
	`

	var rows pgx.Rows
	var err error
	if userID != nil {
		rows, err = r.pool.Query(ctx, query, hubID, limit, offset, *userID)
	} else {
		// When no user, still need to pass a placeholder for the LEFT JOIN
		rows, err = r.pool.Query(ctx, query, hubID, limit, offset, nil)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*PlatformPost
	for rows.Next() {
		post := &PlatformPost{}
		if err := scanPlatformPostWithVote(rows, post); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// GetBySubreddit retrieves posts by target subreddit
func (r *PlatformPostRepository) GetBySubreddit(ctx context.Context, subreddit string, sortBy string, limit, offset int) ([]*PlatformPost, error) {
	return r.GetBySubredditWithUser(ctx, subreddit, sortBy, limit, offset, nil)
}

// GetBySubredditWithUser retrieves posts by target subreddit with optional user vote information
func (r *PlatformPostRepository) GetBySubredditWithUser(ctx context.Context, subreddit string, sortBy string, limit, offset int, userID *int) ([]*PlatformPost, error) {
	var orderClause string
	switch sortBy {
	case "hot":
		orderClause = "ORDER BY p.hot_score DESC, p.created_at DESC"
	case "new":
		orderClause = "ORDER BY p.created_at DESC"
	case "top":
		orderClause = "ORDER BY p.score DESC, p.created_at DESC"
	case "rising":
		orderClause = `ORDER BY (p.score::float / GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600, 1)) DESC`
	default:
		orderClause = "ORDER BY p.hot_score DESC, p.created_at DESC"
	}

	query := `
		SELECT ` + platformPostSelectColumnsPrefixed + `,
		CASE
			WHEN pv.is_upvote IS NULL THEN NULL
			WHEN pv.is_upvote = TRUE THEN 1
			ELSE -1
		END as user_vote
		FROM platform_posts p
		LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $4
		WHERE p.target_subreddit = $1 AND p.is_deleted = FALSE
		` + orderClause + `
		LIMIT $2 OFFSET $3
	`

	var rows pgx.Rows
	var err error
	if userID != nil {
		rows, err = r.pool.Query(ctx, query, subreddit, limit, offset, *userID)
	} else {
		rows, err = r.pool.Query(ctx, query, subreddit, limit, offset, nil)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*PlatformPost
	for rows.Next() {
		post := &PlatformPost{}
		if err := scanPlatformPostWithVote(rows, post); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// GetByTags retrieves posts that contain any of the specified tags
func (r *PlatformPostRepository) GetByTags(ctx context.Context, tags []string, limit, offset int) ([]*PlatformPost, error) {
	query := `
		SELECT ` + platformPostSelectColumns + `
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
		if err := scanPlatformPost(rows, post); err != nil {
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

// UpdateCreatedAt overrides the stored created_at timestamp for a post.
func (r *PlatformPostRepository) UpdateCreatedAt(ctx context.Context, postID int, createdAt time.Time) error {
	_, err := r.pool.Exec(ctx, `UPDATE platform_posts SET created_at = $1 WHERE id = $2`, createdAt, postID)
	return err
}

func scanPlatformPost(row pgx.Row, post *PlatformPost, extraDest ...interface{}) error {
	dests := []interface{}{
		&post.ID,
		&post.AuthorID,
		&post.HubID,
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
		&post.CrosspostOriginType,
		&post.CrosspostOriginSubreddit,
		&post.CrosspostOriginPostID,
		&post.CrosspostOriginalTitle,
		&post.TargetSubreddit,
		&post.CrosspostedAt,
		&post.CreatedAt,
		&post.HotScore,
	}
	dests = append(dests, extraDest...)
	return row.Scan(dests...)
}

func scanPlatformPostWithVote(row pgx.Row, post *PlatformPost, extraDest ...interface{}) error {
	dests := []interface{}{
		&post.ID,
		&post.AuthorID,
		&post.HubID,
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
		&post.CrosspostOriginType,
		&post.CrosspostOriginSubreddit,
		&post.CrosspostOriginPostID,
		&post.CrosspostOriginalTitle,
		&post.TargetSubreddit,
		&post.CrosspostedAt,
		&post.CreatedAt,
		&post.HotScore,
		&post.UserVote,
	}
	dests = append(dests, extraDest...)
	return row.Scan(dests...)
}

// Vote records a user's vote and updates aggregate counts, preventing duplicates.
// isUpvote: true (upvote), false (downvote), nil (remove vote)
func (r *PlatformPostRepository) Vote(ctx context.Context, postID int, userID int, isUpvote *bool) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var existingIsUpvote bool
	err = tx.QueryRow(ctx, "SELECT is_upvote FROM post_votes WHERE post_id = $1 AND user_id = $2", postID, userID).Scan(&existingIsUpvote)
	if err != nil && err != pgx.ErrNoRows {
		return err
	}

	switch {
	case err == pgx.ErrNoRows:
		// New vote
		if isUpvote == nil {
			return tx.Commit(ctx) // nothing to remove
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO post_votes (post_id, user_id, is_upvote)
			VALUES ($1, $2, $3)
		`, postID, userID, *isUpvote); err != nil {
			return err
		}

		if *isUpvote {
			if _, err := tx.Exec(ctx, `
				UPDATE platform_posts
				SET upvotes = upvotes + 1, score = score + 1
				WHERE id = $1
			`, postID); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `
				UPDATE platform_posts
				SET downvotes = downvotes + 1, score = score - 1
				WHERE id = $1
			`, postID); err != nil {
				return err
			}
		}
	case isUpvote == nil:
		// Remove existing vote
		if _, err := tx.Exec(ctx, `DELETE FROM post_votes WHERE post_id = $1 AND user_id = $2`, postID, userID); err != nil {
			return err
		}
		if existingIsUpvote {
			if _, err := tx.Exec(ctx, `
				UPDATE platform_posts
				SET upvotes = GREATEST(upvotes - 1, 0),
				    score = score - 1
				WHERE id = $1
			`, postID); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `
				UPDATE platform_posts
				SET downvotes = GREATEST(downvotes - 1, 0),
				    score = score + 1
				WHERE id = $1
			`, postID); err != nil {
				return err
			}
		}
	case existingIsUpvote == *isUpvote:
		// Duplicate same-direction vote: no-op
		return tx.Commit(ctx)
	default:
		// Toggle vote direction
		if _, err := tx.Exec(ctx, `
			UPDATE post_votes
			SET is_upvote = $3, created_at = CURRENT_TIMESTAMP
			WHERE post_id = $1 AND user_id = $2
		`, postID, userID, *isUpvote); err != nil {
			return err
		}

		if *isUpvote {
			// Down -> Up
			if _, err := tx.Exec(ctx, `
				UPDATE platform_posts
				SET upvotes = upvotes + 1,
				    downvotes = GREATEST(downvotes - 1, 0),
				    score = score + 2
				WHERE id = $1
			`, postID); err != nil {
				return err
			}
		} else {
			// Up -> Down
			if _, err := tx.Exec(ctx, `
				UPDATE platform_posts
				SET downvotes = downvotes + 1,
				    upvotes = GREATEST(upvotes - 1, 0),
				    score = score - 2
				WHERE id = $1
			`, postID); err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

// GetPopularFeed returns filtered, personalized feed (h/popular)
// Excludes quarantined hubs
// Optionally filters by subscribed hub IDs if provided
// Sorts by hot_score DESC (or other sort option)
func (r *PlatformPostRepository) GetPopularFeed(
	ctx context.Context,
	subscribedHubIDs []int,
	sort string,
	limit, offset int,
) ([]*PlatformPost, error) {
	var orderClause string
	switch sort {
	case "hot":
		orderClause = "ORDER BY p.hot_score DESC, p.created_at DESC"
	case "new":
		orderClause = "ORDER BY p.created_at DESC"
	case "top":
		orderClause = "ORDER BY p.score DESC, p.created_at DESC"
	case "rising":
		orderClause = `ORDER BY (p.score::float / GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600, 1)) DESC`
	default:
		orderClause = "ORDER BY p.hot_score DESC, p.created_at DESC"
	}

	// Base WHERE clause excludes deleted posts, quarantined hubs, and crossposted posts
	whereClause := `WHERE p.is_deleted = FALSE AND h.is_quarantined = FALSE AND p.target_subreddit IS NULL`

	var rows pgx.Rows
	var err error

	if len(subscribedHubIDs) > 0 {
		// Filter by subscribed hubs
		whereClause += ` AND p.hub_id = ANY($1)`
		query := `
			SELECT ` + platformPostSelectColumnsPrefixed + `, h.name as hub_name, u.username as author_username
			FROM platform_posts p
			JOIN hubs h ON p.hub_id = h.id
			JOIN users u ON p.author_id = u.id
			` + whereClause + `
			` + orderClause + `
			LIMIT $2 OFFSET $3`

		rows, err = r.pool.Query(ctx, query, subscribedHubIDs, limit, offset)
	} else {
		// No subscription filter - return popular from all non-quarantined hubs
		query := `
			SELECT ` + platformPostSelectColumnsPrefixed + `, h.name as hub_name, u.username as author_username
			FROM platform_posts p
			JOIN hubs h ON p.hub_id = h.id
			JOIN users u ON p.author_id = u.id
			` + whereClause + `
			` + orderClause + `
			LIMIT $1 OFFSET $2`

		rows, err = r.pool.Query(ctx, query, limit, offset)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*PlatformPost
	for rows.Next() {
		post := &PlatformPost{}
		var hubName sql.NullString
		var authorUsername sql.NullString
		if err := scanPlatformPost(rows, post, &hubName, &authorUsername); err != nil {
			return nil, err
		}
		if hubName.Valid {
			post.HubName = hubName.String
			if post.Hub == nil {
				post.Hub = &Hub{}
			}
			post.Hub.Name = hubName.String
		}
		if authorUsername.Valid {
			post.AuthorUsername = authorUsername.String
			if post.Author == nil {
				post.Author = &User{}
			}
			post.Author.Username = authorUsername.String
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// GetAllFeed returns global firehose (h/all)
// Includes quarantined hubs (unless user opts out)
// No subscription filtering
// Sorts by hot_score DESC
func (r *PlatformPostRepository) GetAllFeed(
	ctx context.Context,
	sort string,
	limit, offset int,
) ([]*PlatformPost, error) {
	var orderClause string
	switch sort {
	case "hot":
		orderClause = "ORDER BY hot_score DESC, created_at DESC"
	case "new":
		orderClause = "ORDER BY created_at DESC"
	case "top":
		orderClause = "ORDER BY score DESC, created_at DESC"
	case "rising":
		orderClause = `ORDER BY (score::float / GREATEST(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600, 1)) DESC`
	default:
		orderClause = "ORDER BY hot_score DESC, created_at DESC"
	}

	query := `
		SELECT ` + platformPostSelectColumns + `
		FROM platform_posts
		WHERE is_deleted = FALSE AND target_subreddit IS NULL
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
		if err := scanPlatformPost(rows, post); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

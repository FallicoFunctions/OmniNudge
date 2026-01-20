package models

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GalleryImage represents a single image in a gallery post
type GalleryImage struct {
	URL          string `json:"url"`
	MediaType    string `json:"media_type,omitempty"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	Width        int    `json:"width,omitempty"`
	Height       int    `json:"height,omitempty"`
}

// PlatformPost represents a native post created by users
type PlatformPost struct {
	ID              int     `json:"id"`
	AuthorID        int     `json:"author_id"`
	Author          *User   `json:"author,omitempty"`          // Optional populated user info
	AuthorUsername  string  `json:"author_username,omitempty"` // Author's username
	HubID           *int    `json:"hub_id,omitempty"`          // Optional: only set for hub posts
	Hub             *Hub    `json:"hub,omitempty"`
	HubName         string  `json:"hub_name,omitempty"`
	HubDisplayTitle *string `json:"hub_display_title,omitempty"`

	// Post content
	Title string  `json:"title"`
	Body  *string `json:"body,omitempty"`

	// Categorization
	Tags []string `json:"tags,omitempty"`
	NSFW bool     `json:"nsfw"`

	// Media (optional)
	MediaURL      *string        `json:"media_url,omitempty"`
	MediaType     *string        `json:"media_type,omitempty"`
	ThumbnailURL  *string        `json:"thumbnail_url,omitempty"`
	GalleryImages []GalleryImage `json:"gallery_images,omitempty"` // Array of gallery images

	// Engagement metrics
	Score       int     `json:"score"`
	Upvotes     int     `json:"upvotes"`
	Downvotes   int     `json:"downvotes"`
	NumComments int     `json:"num_comments"`
	ViewCount   int     `json:"view_count"`
	HotScore    float64 `json:"hot_score"` // Reddit-style hot ranking score

	// User interaction (only populated when user is authenticated)
	UserVote     *int  `json:"user_vote,omitempty"`     // -1 (downvote), 0 (no vote), 1 (upvote), or null if not authenticated
	HasCommented *bool `json:"has_commented,omitempty"` // true if authenticated user has top-level comment on this post

	// Status
	IsPinned       bool       `json:"is_pinned"`
	PinnedPosition *int       `json:"pinned_position,omitempty"`
	IsDeleted      bool       `json:"is_deleted"`
	IsEdited       bool       `json:"is_edited"`
	EditedAt       *time.Time `json:"edited_at,omitempty"`

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

func buildTimeRangeClause(start, end *time.Time, startingIndex int) (string, []interface{}) {
	clause := ""
	args := []interface{}{}
	idx := startingIndex

	if start != nil {
		clause += fmt.Sprintf(" AND p.created_at >= $%d", idx)
		args = append(args, *start)
		idx++
	}

	if end != nil {
		clause += fmt.Sprintf(" AND p.created_at <= $%d", idx)
		args = append(args, *end)
	}

	return clause, args
}

func buildPlatformPostOrder(sortBy string, includeID bool) string {
	switch sortBy {
	case "hot":
		if includeID {
			return "ORDER BY p.hot_score DESC, p.created_at DESC, p.id DESC"
		}
		return "ORDER BY p.hot_score DESC, p.created_at DESC"
	case "new":
		if includeID {
			return "ORDER BY p.created_at DESC, p.id DESC"
		}
		return "ORDER BY p.created_at DESC"
	case "top":
		if includeID {
			return "ORDER BY p.score DESC, p.created_at DESC, p.id DESC"
		}
		return "ORDER BY p.score DESC, p.created_at DESC"
	case "rising":
		if includeID {
			return fmt.Sprintf("ORDER BY %s DESC, p.created_at DESC, p.id DESC", platformPostRisingScoreExpr)
		}
		return fmt.Sprintf("ORDER BY %s DESC, p.created_at DESC", platformPostRisingScoreExpr)
	case "controversial":
		if includeID {
			return fmt.Sprintf("ORDER BY %s DESC, p.created_at DESC, p.id DESC", platformPostControversialScoreExpr)
		}
		return fmt.Sprintf("ORDER BY %s DESC, p.created_at DESC", platformPostControversialScoreExpr)
	default:
		if includeID {
			return "ORDER BY p.hot_score DESC, p.created_at DESC, p.id DESC"
		}
		return "ORDER BY p.hot_score DESC, p.created_at DESC"
	}
}

func buildPlatformPostCursorClause(sortBy string, cursor *PlatformPostCursor, startingIndex int) (string, []interface{}) {
	if cursor == nil {
		return "", nil
	}
	switch sortBy {
	case "new":
		return fmt.Sprintf(" AND (p.created_at, p.id) < ($%d, $%d)", startingIndex, startingIndex+1),
			[]interface{}{cursor.CreatedAt, cursor.ID}
	case "top":
		return fmt.Sprintf(" AND (p.score, p.created_at, p.id) < ($%d, $%d, $%d)", startingIndex, startingIndex+1, startingIndex+2),
			[]interface{}{cursor.Score, cursor.CreatedAt, cursor.ID}
	case "hot":
		return fmt.Sprintf(" AND (p.hot_score, p.created_at, p.id) < ($%d, $%d, $%d)", startingIndex, startingIndex+1, startingIndex+2),
			[]interface{}{cursor.HotScore, cursor.CreatedAt, cursor.ID}
	case "rising":
		return fmt.Sprintf(" AND (%s, p.created_at, p.id) < ($%d, $%d, $%d)", platformPostRisingScoreExpr, startingIndex, startingIndex+1, startingIndex+2),
			[]interface{}{cursor.RisingScore, cursor.CreatedAt, cursor.ID}
	case "controversial":
		return fmt.Sprintf(" AND (%s, p.created_at, p.id) < ($%d, $%d, $%d)", platformPostControversialScoreExpr, startingIndex, startingIndex+1, startingIndex+2),
			[]interface{}{cursor.ControversialScore, cursor.CreatedAt, cursor.ID}
	default:
		return "", nil
	}
}

const platformPostRisingScoreExpr = "(p.score::float / GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600, 1))"

const platformPostControversialScoreExpr = `
	(CASE
		WHEN (p.upvotes + p.downvotes) = 0 THEN 0
		ELSE
			(1 - ABS((p.upvotes::float / (p.upvotes + p.downvotes)) - 0.5) * 2)
			* LOG(10, (p.upvotes + p.downvotes)::float + 1)
	END)
`

const platformPostSelectColumnsPrefixed = `
	p.id, p.author_id, u.username, p.hub_id, p.title, p.body, p.tags, p.media_url, p.media_type, p.thumbnail_url,
	p.score, p.upvotes, p.downvotes, p.num_comments, p.view_count,
	p.is_pinned, p.pinned_position, p.is_deleted, p.is_edited, p.edited_at,
	p.crosspost_origin_type, p.crosspost_origin_subreddit, p.crosspost_origin_post_id, p.crosspost_original_title,
	p.target_subreddit, p.nsfw, p.crossposted_at, p.created_at, p.hot_score, p.gallery_images
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
	// Marshal gallery_images to JSONB
	var galleryImagesJSON []byte
	var err error
	if len(post.GalleryImages) > 0 {
		galleryImagesJSON, err = json.Marshal(post.GalleryImages)
		if err != nil {
			return err
		}
	}

	query := `
		INSERT INTO platform_posts (
			author_id, hub_id, title, body, tags, media_url, media_type, thumbnail_url,
			crosspost_origin_type, crosspost_origin_subreddit, crosspost_origin_post_id, crosspost_original_title,
			target_subreddit, nsfw, crossposted_at, gallery_images
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		RETURNING id, score, upvotes, downvotes, num_comments, view_count, is_pinned, pinned_position, is_deleted, is_edited, edited_at, crossposted_at, created_at
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
		post.NSFW,
		post.CrosspostedAt,
		galleryImagesJSON,
	).Scan(
		&post.ID,
		&post.Score,
		&post.Upvotes,
		&post.Downvotes,
		&post.NumComments,
		&post.ViewCount,
		&post.IsPinned,
		&post.PinnedPosition,
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
		SELECT ` + platformPostSelectColumnsPrefixed + `
		FROM platform_posts p
		LEFT JOIN users u ON p.author_id = u.id
		WHERE p.id = $1 AND p.is_deleted = FALSE AND u.shadow_banned = FALSE
	`

	err := scanPlatformPost(r.pool.QueryRow(ctx, query, id), post)

	if err != nil {
		if err == pgx.ErrNoRows {
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
		END as user_vote,
		CASE
			WHEN pc.id IS NOT NULL THEN TRUE
			ELSE FALSE
		END as has_commented
		FROM platform_posts p
		LEFT JOIN users u ON p.author_id = u.id
		LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $2
		LEFT JOIN post_comments pc ON pc.post_id = p.id AND pc.user_id = $2 AND pc.parent_comment_id IS NULL AND pc.is_deleted = FALSE
		WHERE p.id = $1 AND p.is_deleted = FALSE AND u.shadow_banned = FALSE
	`

	var err error
	if userID != nil {
		err = scanPlatformPostWithUserInfo(r.pool.QueryRow(ctx, query, id, *userID), post)
	} else {
		err = scanPlatformPostWithUserInfo(r.pool.QueryRow(ctx, query, id, nil), post)
	}

	if err != nil {
		if err == pgx.ErrNoRows {
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
		SELECT ` + platformPostSelectColumnsPrefixed + `
		FROM platform_posts p
		LEFT JOIN users u ON p.author_id = u.id
		WHERE p.is_deleted = FALSE AND u.shadow_banned = FALSE
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
		SELECT ` + platformPostSelectColumnsPrefixed + `
		FROM platform_posts p
		LEFT JOIN users u ON p.author_id = u.id
		WHERE p.author_id = $1 AND p.is_deleted = FALSE AND u.shadow_banned = FALSE
		ORDER BY p.created_at DESC
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
	return r.GetByHubWithUser(ctx, hubID, sortBy, limit, offset, nil, nil, nil)
}

func buildHubPinnedClause(pinnedFilter *bool) string {
	if pinnedFilter == nil {
		return ""
	}
	if *pinnedFilter {
		return " AND p.is_pinned = TRUE"
	}
	return " AND p.is_pinned = FALSE"
}

func buildHubPostsBaseQuery(pinnedFilter *bool, userIDParamIndex int) string {
	userIDParam := fmt.Sprintf("$%d", userIDParamIndex)
	return `
		SELECT ` + platformPostSelectColumnsPrefixed + `,
		CASE
			WHEN pv.is_upvote IS NULL THEN NULL
			WHEN pv.is_upvote = TRUE THEN 1
			ELSE -1
		END as user_vote,
		CASE
			WHEN pc.id IS NOT NULL THEN TRUE
			ELSE FALSE
		END as has_commented
		FROM platform_posts p
		LEFT JOIN users u ON p.author_id = u.id
		LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = ` + userIDParam + `
		LEFT JOIN post_comments pc ON pc.post_id = p.id AND pc.user_id = ` + userIDParam + ` AND pc.parent_comment_id IS NULL AND pc.is_deleted = FALSE
		WHERE p.hub_id = $1 AND p.is_deleted = FALSE AND u.shadow_banned = FALSE AND (p.target_subreddit IS NULL OR p.target_subreddit = '')` + buildHubPinnedClause(pinnedFilter)
}

func (r *PlatformPostRepository) getByHubWithUser(
	ctx context.Context,
	hubID int,
	sortBy string,
	limit, offset int,
	userID *int,
	startTime, endTime *time.Time,
	pinnedFilter *bool,
) ([]*PlatformPost, error) {
	orderClause := buildPlatformPostOrder(sortBy, false)
	if pinnedFilter != nil && *pinnedFilter {
		orderClause = "ORDER BY p.pinned_position ASC NULLS LAST, p.created_at DESC, p.id DESC"
	}
	timeClause, timeArgs := buildTimeRangeClause(startTime, endTime, 5)

	query := buildHubPostsBaseQuery(pinnedFilter, 4) + timeClause + `
		` + orderClause + `
		LIMIT $2 OFFSET $3
	`

	args := []interface{}{hubID, limit, offset}
	if userID != nil {
		args = append(args, *userID)
	} else {
		args = append(args, nil)
	}
	args = append(args, timeArgs...)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*PlatformPost
	for rows.Next() {
		post := &PlatformPost{}
		if err := scanPlatformPostWithUserInfo(rows, post); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// GetByHubWithUser retrieves posts by hub with optional user vote information
func (r *PlatformPostRepository) GetByHubWithUser(
	ctx context.Context,
	hubID int,
	sortBy string,
	limit, offset int,
	userID *int,
	startTime, endTime *time.Time,
) ([]*PlatformPost, error) {
	return r.getByHubWithUser(ctx, hubID, sortBy, limit, offset, userID, startTime, endTime, nil)
}

// GetByHubWithUserExcludingPinned retrieves posts by hub excluding pinned posts.
func (r *PlatformPostRepository) GetByHubWithUserExcludingPinned(
	ctx context.Context,
	hubID int,
	sortBy string,
	limit, offset int,
	userID *int,
	startTime, endTime *time.Time,
) ([]*PlatformPost, error) {
	pinned := false
	return r.getByHubWithUser(ctx, hubID, sortBy, limit, offset, userID, startTime, endTime, &pinned)
}

// GetPinnedByHubWithUser retrieves pinned posts by hub.
func (r *PlatformPostRepository) GetPinnedByHubWithUser(
	ctx context.Context,
	hubID int,
	limit int,
	userID *int,
	startTime, endTime *time.Time,
) ([]*PlatformPost, error) {
	pinned := true
	return r.getByHubWithUser(ctx, hubID, "new", limit, 0, userID, startTime, endTime, &pinned)
}

func (r *PlatformPostRepository) getByHubWithCursor(
	ctx context.Context,
	hubID int,
	sortBy string,
	limit int,
	cursor *PlatformPostCursor,
	userID *int,
	startTime, endTime *time.Time,
	pinnedFilter *bool,
) ([]*PlatformPost, error) {
	orderClause := buildPlatformPostOrder(sortBy, true)
	timeClause, timeArgs := buildTimeRangeClause(startTime, endTime, 4)
	cursorClause, cursorArgs := buildPlatformPostCursorClause(sortBy, cursor, 4+len(timeArgs))

	query := buildHubPostsBaseQuery(pinnedFilter, 3) + timeClause + cursorClause + `
		` + orderClause + `
		LIMIT $2
	`

	args := []interface{}{hubID, limit}
	if userID != nil {
		args = append(args, *userID)
	} else {
		args = append(args, nil)
	}
	args = append(args, timeArgs...)
	args = append(args, cursorArgs...)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*PlatformPost
	for rows.Next() {
		post := &PlatformPost{}
		if err := scanPlatformPostWithUserInfo(rows, post); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// GetByHubWithCursor retrieves posts by hub using cursor-based pagination.
func (r *PlatformPostRepository) GetByHubWithCursor(
	ctx context.Context,
	hubID int,
	sortBy string,
	limit int,
	cursor *PlatformPostCursor,
	userID *int,
	startTime, endTime *time.Time,
) ([]*PlatformPost, error) {
	return r.getByHubWithCursor(ctx, hubID, sortBy, limit, cursor, userID, startTime, endTime, nil)
}

// GetByHubWithCursorExcludingPinned retrieves posts by hub using cursor-based pagination excluding pinned posts.
func (r *PlatformPostRepository) GetByHubWithCursorExcludingPinned(
	ctx context.Context,
	hubID int,
	sortBy string,
	limit int,
	cursor *PlatformPostCursor,
	userID *int,
	startTime, endTime *time.Time,
) ([]*PlatformPost, error) {
	pinned := false
	return r.getByHubWithCursor(ctx, hubID, sortBy, limit, cursor, userID, startTime, endTime, &pinned)
}

// GetBySubreddit retrieves posts by target subreddit
func (r *PlatformPostRepository) GetBySubreddit(ctx context.Context, subreddit string, sortBy string, limit, offset int) ([]*PlatformPost, error) {
	return r.GetBySubredditWithUser(ctx, subreddit, sortBy, limit, offset, nil, nil, nil)
}

// GetBySubredditWithUser retrieves posts by target subreddit with optional user vote information
func (r *PlatformPostRepository) GetBySubredditWithUser(
	ctx context.Context,
	subreddit string,
	sortBy string,
	limit, offset int,
	userID *int,
	startTime, endTime *time.Time,
) ([]*PlatformPost, error) {
	orderClause := buildPlatformPostOrder(sortBy, false)

	timeClause, timeArgs := buildTimeRangeClause(startTime, endTime, 5)

	query := `
		SELECT ` + platformPostSelectColumnsPrefixed + `,
		CASE
			WHEN pv.is_upvote IS NULL THEN NULL
			WHEN pv.is_upvote = TRUE THEN 1
			ELSE -1
		END as user_vote,
		CASE
			WHEN pc.id IS NOT NULL THEN TRUE
			ELSE FALSE
		END as has_commented
		FROM platform_posts p
		LEFT JOIN users u ON p.author_id = u.id
		LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $4
		LEFT JOIN post_comments pc ON pc.post_id = p.id AND pc.user_id = $4 AND pc.parent_comment_id IS NULL AND pc.is_deleted = FALSE
		WHERE p.target_subreddit = $1 AND p.is_deleted = FALSE AND u.shadow_banned = FALSE` + timeClause + `
		` + orderClause + `
		LIMIT $2 OFFSET $3
	`

	args := []interface{}{subreddit, limit, offset}
	if userID != nil {
		args = append(args, *userID)
	} else {
		args = append(args, nil)
	}
	args = append(args, timeArgs...)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*PlatformPost
	for rows.Next() {
		post := &PlatformPost{}
		if err := scanPlatformPostWithUserInfo(rows, post); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// GetBySubredditWithCursor retrieves posts by target subreddit with cursor-based pagination.
func (r *PlatformPostRepository) GetBySubredditWithCursor(
	ctx context.Context,
	subreddit string,
	sortBy string,
	limit int,
	cursor *PlatformPostCursor,
	userID *int,
	startTime, endTime *time.Time,
) ([]*PlatformPost, error) {
	orderClause := buildPlatformPostOrder(sortBy, true)
	timeClause, timeArgs := buildTimeRangeClause(startTime, endTime, 4)
	cursorClause, cursorArgs := buildPlatformPostCursorClause(sortBy, cursor, 4+len(timeArgs))

	query := `
		SELECT ` + platformPostSelectColumnsPrefixed + `,
		CASE
			WHEN pv.is_upvote IS NULL THEN NULL
			WHEN pv.is_upvote = TRUE THEN 1
			ELSE -1
		END as user_vote,
		CASE
			WHEN pc.id IS NOT NULL THEN TRUE
			ELSE FALSE
		END as has_commented
		FROM platform_posts p
		LEFT JOIN users u ON p.author_id = u.id
		LEFT JOIN post_votes pv ON pv.post_id = p.id AND pv.user_id = $3
		LEFT JOIN post_comments pc ON pc.post_id = p.id AND pc.user_id = $3 AND pc.parent_comment_id IS NULL AND pc.is_deleted = FALSE
		WHERE p.target_subreddit = $1 AND p.is_deleted = FALSE AND u.shadow_banned = FALSE` + timeClause + cursorClause + `
		` + orderClause + `
		LIMIT $2
	`

	args := []interface{}{subreddit, limit}
	if userID != nil {
		args = append(args, *userID)
	} else {
		args = append(args, nil)
	}
	args = append(args, timeArgs...)
	args = append(args, cursorArgs...)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*PlatformPost
	for rows.Next() {
		post := &PlatformPost{}
		if err := scanPlatformPostWithUserInfo(rows, post); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// GetByTags retrieves posts that contain any of the specified tags
func (r *PlatformPostRepository) GetByTags(ctx context.Context, tags []string, limit, offset int) ([]*PlatformPost, error) {
	query := `
		SELECT ` + platformPostSelectColumnsPrefixed + `
		FROM platform_posts p
		LEFT JOIN users u ON p.author_id = u.id
		WHERE tags && $1 AND p.is_deleted = FALSE AND u.shadow_banned = FALSE
		ORDER BY p.created_at DESC
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
	var galleryImagesBytes []byte
	var authorUsername sql.NullString
	dests := []interface{}{
		&post.ID,
		&post.AuthorID,
		&authorUsername,
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
		&post.IsPinned,
		&post.PinnedPosition,
		&post.IsDeleted,
		&post.IsEdited,
		&post.EditedAt,
		&post.CrosspostOriginType,
		&post.CrosspostOriginSubreddit,
		&post.CrosspostOriginPostID,
		&post.CrosspostOriginalTitle,
		&post.TargetSubreddit,
		&post.NSFW,
		&post.CrosspostedAt,
		&post.CreatedAt,
		&post.HotScore,
		&galleryImagesBytes,
	}
	dests = append(dests, extraDest...)
	if err := row.Scan(dests...); err != nil {
		return err
	}

	// Unmarshal gallery_images JSONB (skip if null/empty)
	if len(galleryImagesBytes) > 0 && string(galleryImagesBytes) != "null" {
		if err := json.Unmarshal(galleryImagesBytes, &post.GalleryImages); err != nil {
			return err
		}
	}

	if authorUsername.Valid {
		post.AuthorUsername = authorUsername.String
		if post.Author == nil {
			post.Author = &User{}
		}
		post.Author.Username = authorUsername.String
	}

	return nil
}

func scanPlatformPostWithUserInfo(row pgx.Row, post *PlatformPost, extraDest ...interface{}) error {
	var galleryImagesBytes []byte
	var authorUsername sql.NullString
	dests := []interface{}{
		&post.ID,
		&post.AuthorID,
		&authorUsername,
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
		&post.IsPinned,
		&post.PinnedPosition,
		&post.IsDeleted,
		&post.IsEdited,
		&post.EditedAt,
		&post.CrosspostOriginType,
		&post.CrosspostOriginSubreddit,
		&post.CrosspostOriginPostID,
		&post.CrosspostOriginalTitle,
		&post.TargetSubreddit,
		&post.NSFW,
		&post.CrosspostedAt,
		&post.CreatedAt,
		&post.HotScore,
		&galleryImagesBytes,
		&post.UserVote,
		&post.HasCommented,
	}
	dests = append(dests, extraDest...)
	if err := row.Scan(dests...); err != nil {
		return err
	}

	// Unmarshal gallery_images JSONB (skip if null/empty)
	if len(galleryImagesBytes) > 0 && string(galleryImagesBytes) != "null" {
		if err := json.Unmarshal(galleryImagesBytes, &post.GalleryImages); err != nil {
			return err
		}
	}

	if authorUsername.Valid {
		post.AuthorUsername = authorUsername.String
		if post.Author == nil {
			post.Author = &User{}
		}
		post.Author.Username = authorUsername.String
	}

	return nil
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
	startTime, endTime *time.Time,
) ([]*PlatformPost, error) {
	orderClause := buildPlatformPostOrder(sort, false)

	// Base WHERE clause excludes deleted posts, quarantined hubs, and crossposted posts
	whereClause := `WHERE p.is_deleted = FALSE AND h.is_quarantined = FALSE AND p.target_subreddit IS NULL`

	args := []interface{}{}
	paramIndex := 1

	if len(subscribedHubIDs) > 0 {
		whereClause += fmt.Sprintf(" AND p.hub_id = ANY($%d)", paramIndex)
		args = append(args, subscribedHubIDs)
		paramIndex++
	}

	timeClause, timeArgs := buildTimeRangeClause(startTime, endTime, paramIndex)
	whereClause += timeClause
	args = append(args, timeArgs...)
	paramIndex += len(timeArgs)

	limitIdx := paramIndex
	offsetIdx := paramIndex + 1
	args = append(args, limit, offset)

	query := fmt.Sprintf(`
			SELECT %s,
			       h.id as hub_id_val,
			       h.name as hub_name,
			       h.title as hub_title,
			       COALESCE(hs.display_title, h.title) as hub_display_title
			FROM platform_posts p
			LEFT JOIN hubs h ON p.hub_id = h.id
			LEFT JOIN hub_settings hs ON p.hub_id = hs.hub_id
			JOIN users u ON p.author_id = u.id
			%s
			%s
			LIMIT $%d OFFSET $%d`, platformPostSelectColumnsPrefixed, whereClause, orderClause, limitIdx, offsetIdx)

	rows, err := r.pool.Query(ctx, query, args...)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*PlatformPost
	for rows.Next() {
		post := &PlatformPost{}
		var hubID sql.NullInt64
		var hubName sql.NullString
		var hubTitle sql.NullString
		var hubDisplayTitle sql.NullString
		if err := scanPlatformPost(rows, post, &hubID, &hubName, &hubTitle, &hubDisplayTitle); err != nil {
			return nil, err
		}
		if hubName.Valid {
			post.HubName = hubName.String
			if post.Hub == nil {
				post.Hub = &Hub{}
			}
			if hubID.Valid {
				post.Hub.ID = int(hubID.Int64)
			}
			post.Hub.Name = hubName.String
			if hubTitle.Valid {
				titleStr := hubTitle.String
				post.Hub.Title = &titleStr
			}
		}
		if hubDisplayTitle.Valid {
			titleStr := hubDisplayTitle.String
			post.HubDisplayTitle = &titleStr
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

// GetPopularFeedWithCursor returns filtered feed with cursor-based pagination.
func (r *PlatformPostRepository) GetPopularFeedWithCursor(
	ctx context.Context,
	subscribedHubIDs []int,
	sort string,
	limit int,
	cursor *PlatformPostCursor,
	startTime, endTime *time.Time,
) ([]*PlatformPost, error) {
	orderClause := buildPlatformPostOrder(sort, true)

	// Base WHERE clause excludes deleted posts, quarantined hubs, and crossposted posts
	whereClause := `WHERE p.is_deleted = FALSE AND h.is_quarantined = FALSE AND p.target_subreddit IS NULL`

	args := []interface{}{}
	paramIndex := 1

	if len(subscribedHubIDs) > 0 {
		whereClause += fmt.Sprintf(" AND p.hub_id = ANY($%d)", paramIndex)
		args = append(args, subscribedHubIDs)
		paramIndex++
	}

	timeClause, timeArgs := buildTimeRangeClause(startTime, endTime, paramIndex)
	whereClause += timeClause
	args = append(args, timeArgs...)
	paramIndex += len(timeArgs)

	cursorClause, cursorArgs := buildPlatformPostCursorClause(sort, cursor, paramIndex)
	whereClause += cursorClause
	args = append(args, cursorArgs...)
	paramIndex += len(cursorArgs)

	limitIdx := paramIndex
	args = append(args, limit)

	query := fmt.Sprintf(`
			SELECT %s,
			       h.id as hub_id_val,
			       h.name as hub_name,
			       h.title as hub_title,
			       COALESCE(hs.display_title, h.title) as hub_display_title
			FROM platform_posts p
			LEFT JOIN hubs h ON p.hub_id = h.id
			LEFT JOIN hub_settings hs ON p.hub_id = hs.hub_id
			JOIN users u ON p.author_id = u.id
			%s
			%s
			LIMIT $%d`, platformPostSelectColumnsPrefixed, whereClause, orderClause, limitIdx)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*PlatformPost
	for rows.Next() {
		post := &PlatformPost{}
		var hubID sql.NullInt64
		var hubName sql.NullString
		var hubTitle sql.NullString
		var hubDisplayTitle sql.NullString
		if err := scanPlatformPost(rows, post, &hubID, &hubName, &hubTitle, &hubDisplayTitle); err != nil {
			return nil, err
		}
		if hubID.Valid {
			id := int(hubID.Int64)
			post.HubID = &id
			post.Hub = &Hub{ID: id}
			if hubName.Valid {
				post.Hub.Name = hubName.String
				post.HubName = hubName.String
			}
			if hubTitle.Valid {
				titleStr := hubTitle.String
				post.Hub.Title = &titleStr
			}
		}
		if hubDisplayTitle.Valid {
			titleStr := hubDisplayTitle.String
			post.HubDisplayTitle = &titleStr
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
	startTime, endTime *time.Time,
) ([]*PlatformPost, error) {
	orderClause := buildPlatformPostOrder(sort, false)

	timeClause, timeArgs := buildTimeRangeClause(startTime, endTime, 3)

	query := `
		SELECT ` + platformPostSelectColumnsPrefixed + `
		FROM platform_posts p
		LEFT JOIN users u ON p.author_id = u.id
		WHERE p.is_deleted = FALSE AND p.target_subreddit IS NULL AND u.shadow_banned = FALSE` + timeClause + `
		` + orderClause + `
		LIMIT $1 OFFSET $2
	`

	args := []interface{}{limit, offset}
	args = append(args, timeArgs...)

	rows, err := r.pool.Query(ctx, query, args...)
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

// GetAllFeedWithCursor returns global feed with cursor-based pagination.
func (r *PlatformPostRepository) GetAllFeedWithCursor(
	ctx context.Context,
	sort string,
	limit int,
	cursor *PlatformPostCursor,
	startTime, endTime *time.Time,
) ([]*PlatformPost, error) {
	orderClause := buildPlatformPostOrder(sort, true)

	timeClause, timeArgs := buildTimeRangeClause(startTime, endTime, 2)
	cursorClause, cursorArgs := buildPlatformPostCursorClause(sort, cursor, 2+len(timeArgs))

	query := `
		SELECT ` + platformPostSelectColumnsPrefixed + `
		FROM platform_posts p
		LEFT JOIN users u ON p.author_id = u.id
		WHERE p.is_deleted = FALSE AND p.target_subreddit IS NULL AND u.shadow_banned = FALSE` + timeClause + cursorClause + `
		` + orderClause + `
		LIMIT $1
	`

	args := []interface{}{limit}
	args = append(args, timeArgs...)
	args = append(args, cursorArgs...)

	rows, err := r.pool.Query(ctx, query, args...)
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

// MarkAsRemoved marks a post as removed by a moderator
func (r *PlatformPostRepository) MarkAsRemoved(ctx context.Context, postID int, moderatorID int) error {
	query := `
		UPDATE platform_posts
		SET is_removed = TRUE, removed_by = $2, removed_at = NOW()
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, postID, moderatorID)
	return err
}

// MarkAsApproved marks a post as approved (unremoves it)
func (r *PlatformPostRepository) MarkAsApproved(ctx context.Context, postID int) error {
	query := `
		UPDATE platform_posts
		SET is_removed = FALSE, removed_by = NULL, removed_at = NULL
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, postID)
	return err
}

// LockPost locks a post to prevent new comments
func (r *PlatformPostRepository) LockPost(ctx context.Context, postID int) error {
	query := `UPDATE platform_posts SET is_locked = TRUE WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, postID)
	return err
}

// UnlockPost unlocks a post to allow new comments
func (r *PlatformPostRepository) UnlockPost(ctx context.Context, postID int) error {
	query := `UPDATE platform_posts SET is_locked = FALSE WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, postID)
	return err
}

// PinPost pins a post to the top of the hub
func (r *PlatformPostRepository) PinPost(ctx context.Context, postID int) error {
	query := `
		UPDATE platform_posts
		SET is_pinned = TRUE,
		    pinned_position = (
		        SELECT COALESCE(MAX(pinned_position), 0) + 1
		        FROM platform_posts
		        WHERE hub_id = (SELECT hub_id FROM platform_posts WHERE id = $1)
		          AND is_pinned = TRUE
		          AND id <> $1
		    )
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, postID)
	return err
}

// UnpinPost unpins a post
func (r *PlatformPostRepository) UnpinPost(ctx context.Context, postID int) error {
	query := `UPDATE platform_posts SET is_pinned = FALSE, pinned_position = NULL WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, postID)
	return err
}

// GetPinnedIDsByHub retrieves pinned post IDs for a hub in their current order.
func (r *PlatformPostRepository) GetPinnedIDsByHub(ctx context.Context, hubID int) ([]int, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id
		FROM platform_posts
		WHERE hub_id = $1 AND is_pinned = TRUE
		ORDER BY pinned_position ASC NULLS LAST, created_at DESC, id DESC
	`, hubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// UpdatePinnedOrder updates the pinned ordering for a hub.
func (r *PlatformPostRepository) UpdatePinnedOrder(ctx context.Context, hubID int, postIDs []int) error {
	if len(postIDs) == 0 {
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		WITH ordered AS (
			SELECT unnest($1::int[]) AS post_id,
			       generate_series(1, array_length($1, 1)) AS position
		)
		UPDATE platform_posts p
		SET pinned_position = ordered.position
		FROM ordered
		WHERE p.id = ordered.post_id
		  AND p.hub_id = $2
		  AND p.is_pinned = TRUE
	`, postIDs, hubID)
	return err
}

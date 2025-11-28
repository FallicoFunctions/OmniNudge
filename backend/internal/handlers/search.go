package handlers

import (
	"net/http"
	"strconv"

	"github.com/chatreddit/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SearchHandler handles full-text search requests
type SearchHandler struct {
	pool *pgxpool.Pool
}

// NewSearchHandler creates a new search handler
func NewSearchHandler(pool *pgxpool.Pool) *SearchHandler {
	return &SearchHandler{pool: pool}
}

// SearchPosts searches posts using full-text search
// GET /api/v1/search/posts?q=query&limit=20&offset=0
func (h *SearchHandler) SearchPosts(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Search query is required"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit < 1 || limit > 100 {
		limit = 20
	}

	sql := `
		SELECT id, author_id, hub_id, title, body, tags, score, upvotes, downvotes,
		       num_comments, view_count, created_at,
		       ts_rank(search_vector, plainto_tsquery('english', $1)) as rank
		FROM platform_posts
		WHERE search_vector @@ plainto_tsquery('english', $1)
		AND is_deleted = FALSE
		ORDER BY rank DESC, created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := h.pool.Query(c.Request.Context(), sql, query, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
		return
	}
	defer rows.Close()

	var posts []*models.PlatformPost
	for rows.Next() {
		post := &models.PlatformPost{}
		var rank float64
		err := rows.Scan(
			&post.ID, &post.AuthorID, &post.HubID, &post.Title, &post.Body, &post.Tags,
			&post.Score, &post.Upvotes, &post.Downvotes, &post.NumComments, &post.ViewCount,
			&post.CreatedAt, &rank,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse results"})
			return
		}
		posts = append(posts, post)
	}

	c.JSON(http.StatusOK, gin.H{
		"posts":  posts,
		"limit":  limit,
		"offset": offset,
		"query":  query,
	})
}

// SearchComments searches comments using full-text search
// GET /api/v1/search/comments?q=query&limit=20&offset=0
func (h *SearchHandler) SearchComments(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Search query is required"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit < 1 || limit > 100 {
		limit = 20
	}

	sql := `
		SELECT id, post_id, user_id, parent_comment_id, body, depth, score,
		       upvotes, downvotes, created_at,
		       ts_rank(search_vector, plainto_tsquery('english', $1)) as rank
		FROM post_comments
		WHERE search_vector @@ plainto_tsquery('english', $1)
		AND is_deleted = FALSE
		ORDER BY rank DESC, created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := h.pool.Query(c.Request.Context(), sql, query, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
		return
	}
	defer rows.Close()

	var comments []*models.PostComment
	for rows.Next() {
		comment := &models.PostComment{}
		var rank float64
		err := rows.Scan(
			&comment.ID, &comment.PostID, &comment.UserID, &comment.ParentCommentID,
			&comment.Body, &comment.Depth, &comment.Score, &comment.Upvotes, &comment.Downvotes,
			&comment.CreatedAt, &rank,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse results"})
			return
		}
		comments = append(comments, comment)
	}

	c.JSON(http.StatusOK, gin.H{
		"comments": comments,
		"limit":    limit,
		"offset":   offset,
		"query":    query,
	})
}

// SearchUsers searches users using full-text search
// GET /api/v1/search/users?q=query&limit=20&offset=0
func (h *SearchHandler) SearchUsers(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Search query is required"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit < 1 || limit > 100 {
		limit = 20
	}

	sql := `
		SELECT id, username, bio, avatar_url, karma, created_at,
		       ts_rank(search_vector, plainto_tsquery('english', $1)) as rank
		FROM users
		WHERE search_vector @@ plainto_tsquery('english', $1)
		ORDER BY rank DESC, created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := h.pool.Query(c.Request.Context(), sql, query, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
		return
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		user := &models.User{}
		var rank float64
		err := rows.Scan(
			&user.ID, &user.Username, &user.Bio, &user.AvatarURL, &user.Karma,
			&user.CreatedAt, &rank,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse results"})
			return
		}
		users = append(users, user)
	}

	c.JSON(http.StatusOK, gin.H{
		"users":  users,
		"limit":  limit,
		"offset": offset,
		"query":  query,
	})
}

// SearchHubs searches hubs using full-text search
// GET /api/v1/search/hubs?q=query&limit=20&offset=0
func (h *SearchHandler) SearchHubs(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Search query is required"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit < 1 || limit > 100 {
		limit = 20
	}

	sql := `
		SELECT id, name, description, creator_id, created_at,
		       ts_rank(search_vector, plainto_tsquery('english', $1)) as rank
		FROM hubs
		WHERE search_vector @@ plainto_tsquery('english', $1)
		ORDER BY rank DESC, created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := h.pool.Query(c.Request.Context(), sql, query, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
		return
	}
	defer rows.Close()

	var hubs []*models.Hub
	for rows.Next() {
		hub := &models.Hub{}
		var rank float64
		err := rows.Scan(
			&hub.ID, &hub.Name, &hub.Description, &hub.CreatorID,
			&hub.CreatedAt, &rank,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse results"})
			return
		}
		hubs = append(hubs, hub)
	}

	c.JSON(http.StatusOK, gin.H{
		"hubs":   hubs,
		"limit":  limit,
		"offset": offset,
		"query":  query,
	})
}

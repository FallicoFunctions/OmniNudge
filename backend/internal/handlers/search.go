package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/omninudge/backend/internal/models"
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
	includeNSFW, _ := strconv.ParseBool(c.DefaultQuery("include_nsfw", "false"))
	sort := strings.ToLower(c.DefaultQuery("sort", "relevance")) // relevance | new | old
	cursorParam := c.Query("cursor")

	if limit < 1 || limit > 100 {
		limit = 20
	}

	var cursor *searchCursor
	if cursorParam != "" {
		decoded, err := decodeSearchCursor(cursorParam)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cursor"})
			return
		}
		cursor = decoded
	}
	useCursorPagination := cursorParam != "" || offset == 0
	limitArg := limit
	offsetArg := offset
	if useCursorPagination {
		limitArg = limit + 1
		offsetArg = 0
	}

	orderClause := `
		ORDER BY rank DESC, created_at DESC, id DESC
	`
	if sort == "new" {
		orderClause = `
		ORDER BY created_at DESC, rank DESC, id DESC
		`
	} else if sort == "old" {
		orderClause = `
		ORDER BY created_at ASC, rank DESC, id DESC
		`
	}

	rankExpr := "ts_rank(p.search_vector, plainto_tsquery('english', $1))"
	cursorClause, cursorArgs := buildSearchCursorClause(sort, cursor, rankExpr, 5)
	sql := `
		SELECT p.id, p.author_id, p.hub_id, p.title, p.body, p.tags, p.score, p.upvotes, p.downvotes,
		       p.num_comments, p.view_count, p.created_at, p.target_subreddit, p.crosspost_origin_subreddit,
		       h.name as hub_name, u.username as author_username,
		       ` + rankExpr + ` as rank
		FROM platform_posts p
		LEFT JOIN hubs h ON p.hub_id = h.id
		LEFT JOIN users u ON p.author_id = u.id
		WHERE p.search_vector @@ plainto_tsquery('english', $1)
		AND p.is_deleted = FALSE
		AND (p.nsfw = FALSE OR $4 = TRUE)
		AND u.shadow_banned = FALSE` + cursorClause + `
	` + orderClause + `
		LIMIT $2 OFFSET $3
	`

	args := []interface{}{query, limitArg, offsetArg, includeNSFW}
	args = append(args, cursorArgs...)
	rows, err := h.pool.Query(c.Request.Context(), sql, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Search failed",
			"details": err.Error(),
		})
		return
	}
	defer rows.Close()

	type searchPostResult struct {
		post *models.PlatformPost
		rank float64
	}
	var results []searchPostResult
	for rows.Next() {
		post := &models.PlatformPost{}
		var rank float64
		var hubName, authorUsername *string
		err := rows.Scan(
			&post.ID, &post.AuthorID, &post.HubID, &post.Title, &post.Body, &post.Tags,
			&post.Score, &post.Upvotes, &post.Downvotes, &post.NumComments, &post.ViewCount,
			&post.CreatedAt, &post.TargetSubreddit, &post.CrosspostOriginSubreddit,
			&hubName, &authorUsername, &rank,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse results"})
			return
		}
		if hubName != nil {
			post.HubName = *hubName
		}
		if authorUsername != nil {
			post.AuthorUsername = *authorUsername
		}
		results = append(results, searchPostResult{post: post, rank: rank})
	}

	nextCursor := ""
	posts := make([]*models.PlatformPost, 0, len(results))
	if useCursorPagination && len(results) > limit {
		results = results[:limit]
		if len(results) > 0 {
			last := results[len(results)-1]
			nextCursor = encodeSearchCursor(searchCursor{
				ID:        last.post.ID,
				CreatedAt: last.post.CreatedAt,
				Rank:      last.rank,
			})
		}
	}
	for _, result := range results {
		posts = append(posts, result.post)
	}

	response := gin.H{
		"posts":  posts,
		"limit":  limit,
		"offset": offset,
		"query":  query,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
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
	cursorParam := c.Query("cursor")

	if limit < 1 || limit > 100 {
		limit = 20
	}

	var cursor *searchCursor
	if cursorParam != "" {
		decoded, err := decodeSearchCursor(cursorParam)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cursor"})
			return
		}
		cursor = decoded
	}
	useCursorPagination := cursorParam != "" || offset == 0
	limitArg := limit
	offsetArg := offset
	if useCursorPagination {
		limitArg = limit + 1
		offsetArg = 0
	}

	rankExpr := "ts_rank(search_vector, plainto_tsquery('english', $1))"
	cursorClause, cursorArgs := buildSearchCursorClause("relevance", cursor, rankExpr, 4)
	sql := `
		SELECT id, post_id, user_id, parent_comment_id, body, depth, score,
		       upvotes, downvotes, created_at,
		       ` + rankExpr + ` as rank
		FROM post_comments
		WHERE search_vector @@ plainto_tsquery('english', $1)
		AND is_deleted = FALSE` + cursorClause + `
		ORDER BY rank DESC, created_at DESC, id DESC
		LIMIT $2 OFFSET $3
	`

	args := []interface{}{query, limitArg, offsetArg}
	args = append(args, cursorArgs...)
	rows, err := h.pool.Query(c.Request.Context(), sql, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed", "details": err.Error()})
		return
	}
	defer rows.Close()

	type searchCommentResult struct {
		comment *models.PostComment
		rank    float64
	}
	var results []searchCommentResult
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
		results = append(results, searchCommentResult{comment: comment, rank: rank})
	}

	nextCursor := ""
	comments := make([]*models.PostComment, 0, len(results))
	if useCursorPagination && len(results) > limit {
		results = results[:limit]
		if len(results) > 0 {
			last := results[len(results)-1]
			nextCursor = encodeSearchCursor(searchCursor{
				ID:        last.comment.ID,
				CreatedAt: last.comment.CreatedAt,
				Rank:      last.rank,
			})
		}
	}
	for _, result := range results {
		comments = append(comments, result.comment)
	}

	response := gin.H{
		"comments": comments,
		"limit":    limit,
		"offset":   offset,
		"query":    query,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
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
	includeNSFW, _ := strconv.ParseBool(c.DefaultQuery("include_nsfw", "false"))
	sort := strings.ToLower(c.DefaultQuery("sort", "relevance")) // relevance | new | old
	cursorParam := c.Query("cursor")

	if limit < 1 || limit > 100 {
		limit = 20
	}

	var cursor *searchCursor
	if cursorParam != "" {
		decoded, err := decodeSearchCursor(cursorParam)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cursor"})
			return
		}
		cursor = decoded
	}
	useCursorPagination := cursorParam != "" || offset == 0
	limitArg := limit
	offsetArg := offset
	if useCursorPagination {
		limitArg = limit + 1
		offsetArg = 0
	}

	orderClause := `
		ORDER BY rank DESC, created_at DESC, id DESC
	`
	if sort == "new" {
		orderClause = `
		ORDER BY created_at DESC, rank DESC, id DESC
		`
	} else if sort == "old" {
		orderClause = `
		ORDER BY created_at ASC, rank DESC, id DESC
		`
	}

	rankExpr := "ts_rank(search_vector, plainto_tsquery('english', $1))"
	cursorClause, cursorArgs := buildSearchCursorClause(sort, cursor, rankExpr, 5)
	sql := `
		SELECT id, username, bio, avatar_url, karma, created_at,
		       ` + rankExpr + ` as rank
		FROM users
		WHERE search_vector @@ plainto_tsquery('english', $1)
		AND (nsfw = FALSE OR $4 = TRUE)` + cursorClause + `
	` + orderClause + `
		LIMIT $2 OFFSET $3
	`

	args := []interface{}{query, limitArg, offsetArg, includeNSFW}
	args = append(args, cursorArgs...)
	rows, err := h.pool.Query(c.Request.Context(), sql, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed", "details": err.Error()})
		return
	}
	defer rows.Close()

	type searchUserResult struct {
		user *models.User
		rank float64
	}
	var results []searchUserResult
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
		results = append(results, searchUserResult{user: user, rank: rank})
	}

	nextCursor := ""
	users := make([]*models.User, 0, len(results))
	if useCursorPagination && len(results) > limit {
		results = results[:limit]
		if len(results) > 0 {
			last := results[len(results)-1]
			nextCursor = encodeSearchCursor(searchCursor{
				ID:        last.user.ID,
				CreatedAt: last.user.CreatedAt,
				Rank:      last.rank,
			})
		}
	}
	for _, result := range results {
		users = append(users, result.user)
	}

	response := gin.H{
		"users":  users,
		"limit":  limit,
		"offset": offset,
		"query":  query,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
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
	includeNSFW, _ := strconv.ParseBool(c.DefaultQuery("include_nsfw", "false"))
	sort := strings.ToLower(c.DefaultQuery("sort", "relevance")) // relevance | new | old
	cursorParam := c.Query("cursor")

	if limit < 1 || limit > 100 {
		limit = 20
	}

	var cursor *searchCursor
	if cursorParam != "" {
		decoded, err := decodeSearchCursor(cursorParam)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cursor"})
			return
		}
		cursor = decoded
	}
	useCursorPagination := cursorParam != "" || offset == 0
	limitArg := limit
	offsetArg := offset
	if useCursorPagination {
		limitArg = limit + 1
		offsetArg = 0
	}

	orderClause := `
		ORDER BY rank DESC, created_at DESC, id DESC
	`
	if sort == "new" {
		orderClause = `
		ORDER BY created_at DESC, rank DESC, id DESC
		`
	} else if sort == "old" {
		orderClause = `
		ORDER BY created_at ASC, rank DESC, id DESC
		`
	}

	rankExpr := "ts_rank(search_vector, plainto_tsquery('english', $1))"
	cursorClause, cursorArgs := buildSearchCursorClause(sort, cursor, rankExpr, 5)
	sql := `
		SELECT id, name, description, title, type, content_options, is_quarantined, subscriber_count, created_by, created_at,
		       ` + rankExpr + ` as rank
		FROM hubs
		WHERE search_vector @@ plainto_tsquery('english', $1)
		AND (nsfw = FALSE OR $4 = TRUE)` + cursorClause + `
	` + orderClause + `
		LIMIT $2 OFFSET $3
	`

	args := []interface{}{query, limitArg, offsetArg, includeNSFW}
	args = append(args, cursorArgs...)
	rows, err := h.pool.Query(c.Request.Context(), sql, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed", "details": err.Error()})
		return
	}
	defer rows.Close()

	type searchHubResult struct {
		hub  *models.Hub
		rank float64
	}
	var results []searchHubResult
	for rows.Next() {
		hub := &models.Hub{}
		var rank float64
		err := rows.Scan(
			&hub.ID, &hub.Name, &hub.Description, &hub.CreatedBy,
			&hub.CreatedAt, &rank,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse results"})
			return
		}
		results = append(results, searchHubResult{hub: hub, rank: rank})
	}

	nextCursor := ""
	hubs := make([]*models.Hub, 0, len(results))
	if useCursorPagination && len(results) > limit {
		results = results[:limit]
		if len(results) > 0 {
			last := results[len(results)-1]
			nextCursor = encodeSearchCursor(searchCursor{
				ID:        last.hub.ID,
				CreatedAt: last.hub.CreatedAt,
				Rank:      last.rank,
			})
		}
	}
	for _, result := range results {
		hubs = append(hubs, result.hub)
	}

	response := gin.H{
		"hubs":   hubs,
		"limit":  limit,
		"offset": offset,
		"query":  query,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
}

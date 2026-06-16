package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/monitoring"
	zlog "github.com/rs/zerolog/log"
)

// SearchHandler handles full-text search requests
type SearchHandler struct {
	pool *pgxpool.Pool
}

// NewSearchHandler creates a new search handler
func NewSearchHandler(pool *pgxpool.Pool) *SearchHandler {
	return &SearchHandler{pool: pool}
}

// SearchPosts searches posts using full-text search.
// @Summary      Search posts
// @Tags         Search
// @Produce      json
// @Param        q            query  string  true   "Search query"
// @Param        limit        query  int     false  "Page size (default 20, max 100)"
// @Param        offset       query  int     false  "Offset"
// @Param        sort         query  string  false  "Sort: relevance | new | old"
// @Param        include_nsfw query  bool    false  "Include NSFW content"
// @Param        cursor       query  string  false  "Pagination cursor"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /search/posts [get]
func (h *SearchHandler) SearchPosts(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		RespondError(c, http.StatusBadRequest, "Search query is required")
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
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
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
	switch sort {
	case "new":
		orderClause = `
		ORDER BY created_at DESC, rank DESC, id DESC
		`
	case "old":
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
		zlog.Error().Err(err).Msg("search posts query failed")
		RespondError(c, http.StatusInternalServerError, "Search failed")
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
			RespondError(c, http.StatusInternalServerError, "Failed to parse results")
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

// SearchComments searches comments using full-text search.
// @Summary      Search comments
// @Tags         Search
// @Produce      json
// @Param        q       query  string  true   "Search query"
// @Param        limit   query  int     false  "Page size (default 20, max 100)"
// @Param        offset  query  int     false  "Offset"
// @Param        cursor  query  string  false  "Pagination cursor"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /search/comments [get]
func (h *SearchHandler) SearchComments(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		RespondError(c, http.StatusBadRequest, "Search query is required")
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
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
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
		RespondError(c, http.StatusInternalServerError, "Search failed")
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
			RespondError(c, http.StatusInternalServerError, "Failed to parse results")
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

// SearchUsers searches users using full-text search.
// @Summary      Search users
// @Tags         Search
// @Produce      json
// @Param        q            query  string  true   "Search query"
// @Param        limit        query  int     false  "Page size (default 20, max 100)"
// @Param        offset       query  int     false  "Offset"
// @Param        sort         query  string  false  "Sort: relevance | new | old"
// @Param        include_nsfw query  bool    false  "Include NSFW profiles"
// @Param        cursor       query  string  false  "Pagination cursor"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /search/users [get]
func (h *SearchHandler) SearchUsers(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		RespondError(c, http.StatusBadRequest, "Search query is required")
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
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
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
	switch sort {
	case "new":
		orderClause = `
		ORDER BY created_at DESC, rank DESC, id DESC
		`
	case "old":
		orderClause = `
		ORDER BY created_at ASC, rank DESC, id DESC
		`
	}

	// Point 5: load the bidirectional block set BEFORE building the SQL so we
	// can push exclusion into the WHERE clause. This ensures LIMIT/OFFSET are
	// applied against the already-filtered set, preventing the post-query
	// filtering from producing pages shorter than requested.
	searcherID, _ := middleware.GetOptionalUserID(c)
	var excludeIDs []int
	if searcherID != 0 {
		var blockErr error
		excludeIDs, _, blockErr = models.GetAllBlockedIDs(c.Request.Context(), h.pool, searcherID)
		if blockErr != nil {
			// Fail open: return unfiltered results rather than aborting the
			// search entirely — a degraded search is less harmful than a hard 500.
			zlog.Warn().Err(blockErr).Int("searcher_id", searcherID).
				Msg("search: failed to load block set; returning unfiltered results")
			excludeIDs = nil
		}
	}

	rankExpr := "ts_rank(search_vector, plainto_tsquery('english', $1))"
	cursorClause, cursorArgs := buildSearchCursorClause(sort, cursor, rankExpr, 5)

	// The exclusion param index is after $1-$4 (fixed) and any cursor params.
	excludeParamIdx := 5 + len(cursorArgs)
	excludeClause := fmt.Sprintf(" AND ($%d::int[] IS NULL OR id != ALL($%d))", excludeParamIdx, excludeParamIdx)

	sql := `
		SELECT id, username, bio, avatar_url, karma, created_at,
		       ` + rankExpr + ` as rank
		FROM users
		WHERE search_vector @@ plainto_tsquery('english', $1)
		AND (nsfw = FALSE OR $4 = TRUE)` + cursorClause + excludeClause + `
	` + orderClause + `
		LIMIT $2 OFFSET $3
	`

	// Pass a typed nil ([]int(nil)) when there are no excluded IDs so that pgx
	// sends NULL with the correct int[] OID, matching the $N::int[] cast in the SQL.
	// Using an untyped nil interface{} would rely on server-side type inference;
	// a typed nil is explicit and version-stable.
	var excludeParam []int // nil []int → pgx sends NULL int[]
	if len(excludeIDs) > 0 {
		excludeParam = excludeIDs
	}
	args := []interface{}{query, limitArg, offsetArg, includeNSFW}
	args = append(args, cursorArgs...)
	args = append(args, excludeParam)

	rows, err := h.pool.Query(c.Request.Context(), sql, args...)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Search failed")
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
			RespondError(c, http.StatusInternalServerError, "Failed to parse results")
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

// SearchHubs searches hubs using full-text search.
// @Summary      Search hubs
// @Tags         Search
// @Produce      json
// @Param        q            query  string  true   "Search query"
// @Param        limit        query  int     false  "Page size (default 20, max 100)"
// @Param        offset       query  int     false  "Offset"
// @Param        sort         query  string  false  "Sort: relevance | new | old"
// @Param        include_nsfw query  bool    false  "Include NSFW hubs"
// @Param        cursor       query  string  false  "Pagination cursor"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /search/hubs [get]
func (h *SearchHandler) SearchHubs(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		RespondError(c, http.StatusBadRequest, "Search query is required")
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
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
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
	switch sort {
	case "new":
		orderClause = `
		ORDER BY created_at DESC, rank DESC, id DESC
		`
	case "old":
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
		RespondError(c, http.StatusInternalServerError, "Search failed")
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
			&hub.ID,
			&hub.Name,
			&hub.Description,
			&hub.Title,
			&hub.Type,
			&hub.ContentOptions,
			&hub.IsQuarantined,
			&hub.SubscriberCount,
			&hub.CreatedBy,
			&hub.CreatedAt,
			&rank,
		)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to parse results")
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

// SearchMessages searches messages visible to the authenticated user.
// @Summary      Search messages
// @Tags         Search
// @Security     BearerAuth
// @Produce      json
// @Param        q               query  string  false  "Search query"
// @Param        conversation_id query  int     false  "Filter by conversation ID"
// @Param        sender_id       query  int     false  "Filter by sender ID"
// @Param        has_files       query  bool    false  "Filter messages with file attachments"
// @Param        start_date      query  string  false  "Start date (RFC3339)"
// @Param        end_date        query  string  false  "End date (RFC3339)"
// @Param        limit           query  int     false  "Page size (default 50, max 200)"
// @Param        offset          query  int     false  "Offset"
// @Param        sort            query  string  false  "Sort: relevance | newest | oldest"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /search/messages [get]
func (h *SearchHandler) SearchMessages(c *gin.Context) {
	startedAt := time.Now()
	searchSuccess := false
	searchResultCount := 0
	hasQuery := strings.TrimSpace(c.Query("q")) != ""
	defer func() {
		monitoring.RecordMessageSearch(
			time.Since(startedAt),
			searchResultCount,
			searchSuccess,
			hasQuery,
		)
	}()

	authUserID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	query := strings.TrimSpace(c.Query("q"))
	sort := strings.ToLower(c.DefaultQuery("sort", "relevance")) // relevance | new | old
	if sort != "relevance" && sort != "new" && sort != "old" {
		sort = "relevance"
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	includeArchived, _ := strconv.ParseBool(c.DefaultQuery("include_archived", "false"))
	hasFiles, _ := strconv.ParseBool(c.DefaultQuery("has_files", "false"))
	hasLinks, _ := strconv.ParseBool(c.DefaultQuery("has_links", "false"))

	var conversationID *int
	if rawConversationID := strings.TrimSpace(c.Query("conversation_id")); rawConversationID != "" {
		id, err := strconv.Atoi(rawConversationID)
		if err != nil || id <= 0 {
			RespondError(c, http.StatusBadRequest, "Invalid conversation_id")
			return
		}
		conversationID = &id
	}

	var senderID *int
	if rawSenderID := strings.TrimSpace(c.Query("sender_id")); rawSenderID != "" {
		id, err := strconv.Atoi(rawSenderID)
		if err != nil || id <= 0 {
			RespondError(c, http.StatusBadRequest, "Invalid sender_id")
			return
		}
		senderID = &id
	}

	var startDate *time.Time
	if rawStartDate := strings.TrimSpace(c.Query("start_date")); rawStartDate != "" {
		parsed, err := time.Parse(time.RFC3339, rawStartDate)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid start_date (expected RFC3339)")
			return
		}
		startDate = &parsed
	}

	var endDate *time.Time
	if rawEndDate := strings.TrimSpace(c.Query("end_date")); rawEndDate != "" {
		parsed, err := time.Parse(time.RFC3339, rawEndDate)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid end_date (expected RFC3339)")
			return
		}
		endDate = &parsed
	}

	if startDate != nil && endDate != nil && endDate.Before(*startDate) {
		RespondError(c, http.StatusBadRequest, "end_date must be after start_date")
		return
	}

	baseWhere := `
		FROM messages m
		LEFT JOIN media_files mf ON m.media_file_id = mf.id
		LEFT JOIN users su ON su.id = m.sender_id
		INNER JOIN conversations c ON c.id = m.conversation_id
		WHERE
		(
			(
				(c.conversation_type = 'dm' OR c.conversation_type IS NULL)
				AND (c.user1_id = $1 OR c.user2_id = $1)
				AND NOT (
					(c.user1_id = $1 AND c.deleted_for_user1 = TRUE)
					OR
					(c.user2_id = $1 AND c.deleted_for_user2 = TRUE)
				)
			)
			OR
			(c.conversation_type = 'mod_mail' AND EXISTS (
				SELECT 1
				FROM conversation_participants cp
				WHERE cp.conversation_id = c.id AND cp.user_id = $1
			))
		)
		AND (
			(m.sender_id = $1 AND m.deleted_for_sender = FALSE)
			OR
			(m.recipient_id = $1 AND m.deleted_for_recipient = FALSE)
			OR
			(m.is_multi_recipient = TRUE AND EXISTS (
				SELECT 1
				FROM message_recipient_keys mrk
				WHERE mrk.message_id = m.id AND mrk.user_id = $1
			))
		)
	`

	args := []interface{}{authUserID}
	nextArg := 2

	if !includeArchived {
		baseWhere += `
			AND (
				(c.conversation_type = 'mod_mail' AND c.archived_at IS NULL)
				OR
				((c.conversation_type = 'dm' OR c.conversation_type IS NULL) AND NOT (
					(c.user1_id = $1 AND c.archived_for_user1 = TRUE)
					OR
					(c.user2_id = $1 AND c.archived_for_user2 = TRUE)
					OR
					c.archived_at IS NOT NULL
				))
			)
		`
	}

	if conversationID != nil {
		baseWhere += " AND m.conversation_id = $" + strconv.Itoa(nextArg)
		args = append(args, *conversationID)
		nextArg++
	}
	if senderID != nil {
		baseWhere += " AND m.sender_id = $" + strconv.Itoa(nextArg)
		args = append(args, *senderID)
		nextArg++
	}
	if startDate != nil {
		baseWhere += " AND m.sent_at >= $" + strconv.Itoa(nextArg)
		args = append(args, *startDate)
		nextArg++
	}
	if endDate != nil {
		baseWhere += " AND m.sent_at <= $" + strconv.Itoa(nextArg)
		args = append(args, *endDate)
		nextArg++
	}
	if hasFiles {
		baseWhere += " AND (m.media_file_id IS NOT NULL OR m.media_url IS NOT NULL)"
	}
	if hasLinks {
		baseWhere += " AND (LOWER(COALESCE(m.sender_encrypted_content, m.encrypted_content, '')) LIKE '%http%' OR LOWER(COALESCE(mf.storage_url, m.media_url, '')) LIKE '%http%')"
	}

	// NOTE: message contents are encrypted for most rows. Query matching still helps legacy/plaintext rows
	// and username-based lookups.
	rankExpr := "0::double precision"
	snippetExpr := "NULL::text"
	if query != "" {
		likeArg := nextArg
		args = append(args, "%"+strings.ToLower(query)+"%")
		nextArg++
		baseWhere += `
			AND (
				LOWER(COALESCE(m.sender_encrypted_content, m.encrypted_content, '')) LIKE $` + strconv.Itoa(likeArg) + `
				OR EXISTS (
					SELECT 1 FROM users us
					WHERE us.id = m.sender_id AND LOWER(us.username) LIKE $` + strconv.Itoa(likeArg) + `
				)
			)
		`
		rankExpr = `
			(
				CASE
					WHEN LOWER(COALESCE(m.sender_encrypted_content, m.encrypted_content, '')) LIKE $` + strconv.Itoa(likeArg) + ` THEN 3.0
					ELSE 1.0
				END
			)
			+
			(
				CASE
					WHEN m.sent_at >= NOW() - INTERVAL '1 day' THEN 1.5
					WHEN m.sent_at >= NOW() - INTERVAL '7 days' THEN 0.75
					ELSE 0.0
				END
			)
		`
		snippetExpr = `
			CASE
				WHEN LOWER(COALESCE(m.sender_encrypted_content, m.encrypted_content, '')) LIKE $` + strconv.Itoa(likeArg) + `
					THEN LEFT(COALESCE(m.sender_encrypted_content, m.encrypted_content, ''), 200)
				WHEN LOWER(COALESCE(su.username, '')) LIKE $` + strconv.Itoa(likeArg) + `
					THEN 'from @' || su.username
				ELSE NULL
			END
		`
	}

	countSQL := "SELECT COUNT(*) " + baseWhere
	var total int
	if err := h.pool.QueryRow(c.Request.Context(), countSQL, args...).Scan(&total); err != nil {
		RespondError(c, http.StatusInternalServerError, "Search failed")
		return
	}
	searchResultCount = total

	limitArg := nextArg
	offsetArg := nextArg + 1
	orderClause := "ORDER BY (" + rankExpr + ") DESC, m.sent_at DESC, m.id DESC"
	if sort == "new" {
		orderClause = "ORDER BY m.sent_at DESC, m.id DESC"
	} else if sort == "old" {
		orderClause = "ORDER BY m.sent_at ASC, m.id ASC"
	}
	querySQL := `
		SELECT m.id, m.conversation_id, m.sender_id, m.recipient_id, m.encrypted_content,
		       m.sender_encrypted_content, m.message_type, m.sent_at, m.delivered_at, m.read_at,
		       m.deleted_for_sender, m.deleted_for_recipient, m.media_file_id,
		       COALESCE(mf.storage_url, m.media_url) as media_url,
		       COALESCE(m.media_type, mf.file_type) as media_type,
		       COALESCE(m.media_size, mf.file_size) as media_size,
		       m.encryption_version, m.media_encryption_key, m.media_encryption_iv,
		       m.sender_media_encryption_key, COALESCE(m.is_multi_recipient, FALSE) as is_multi_recipient,
		       m.shared_encryption_iv,
		       COALESCE(su.username, '') as sender_username,
		       ` + snippetExpr + ` as search_snippet
	` + baseWhere + `
		` + orderClause + `
		LIMIT $` + strconv.Itoa(limitArg) + ` OFFSET $` + strconv.Itoa(offsetArg)

	dataArgs := append(append([]interface{}{}, args...), limit, offset)
	rows, err := h.pool.Query(c.Request.Context(), querySQL, dataArgs...)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Search failed")
		return
	}
	defer rows.Close()

	type messageSearchResult struct {
		models.Message
		SenderUsername string  `json:"sender_username"`
		SearchSnippet  *string `json:"search_snippet,omitempty"`
	}

	messages := make([]messageSearchResult, 0, limit)
	for rows.Next() {
		message := messageSearchResult{}
		if err := rows.Scan(
			&message.ID,
			&message.ConversationID,
			&message.SenderID,
			&message.RecipientID,
			&message.EncryptedContent,
			&message.SenderEncryptedContent,
			&message.MessageType,
			&message.SentAt,
			&message.DeliveredAt,
			&message.ReadAt,
			&message.DeletedForSender,
			&message.DeletedForRecipient,
			&message.MediaFileID,
			&message.MediaURL,
			&message.MediaType,
			&message.MediaSize,
			&message.EncryptionVersion,
			&message.MediaEncryptionKey,
			&message.MediaEncryptionIV,
			&message.SenderMediaEncryptionKey,
			&message.IsMultiRecipient,
			&message.SharedEncryptionIV,
			&message.SenderUsername,
			&message.SearchSnippet,
		); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to parse results")
			return
		}
		messages = append(messages, message)
	}

	c.JSON(http.StatusOK, gin.H{
		"messages": messages,
		"limit":    limit,
		"offset":   offset,
		"query":    query,
		"total":    total,
		"sort":     sort,
	})
	searchSuccess = true
}

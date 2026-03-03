package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/api/middleware"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
)

// AdminHandler handles admin-level actions
type AdminHandler struct {
	userRepo   ports.UserRepository
	hubModRepo ports.HubModeratorRepository
	pool       *pgxpool.Pool
}

// NewAdminHandler creates a new admin handler
func NewAdminHandler(userRepo ports.UserRepository, hubModRepo ports.HubModeratorRepository, pool *pgxpool.Pool) *AdminHandler {
	return &AdminHandler{
		userRepo:   userRepo,
		hubModRepo: hubModRepo,
		pool:       pool,
	}
}

// PromoteUser promotes or changes a user's role.
// @Summary      Change user role
// @Tags         Admin
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int     true  "User ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/users/{id}/role [post]
func (h *AdminHandler) PromoteUser(c *gin.Context) {
	targetID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return
	}

	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	// Global "moderator" role is no longer supported; use hub moderators instead.
	switch req.Role {
	case "user", "admin":
	default:
		RespondError(c, http.StatusBadRequest, "Invalid role. Use hub moderator assignment for per-hub moderators.")
		return
	}

	if err := h.userRepo.UpdateRole(c.Request.Context(), targetID, req.Role); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update role")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Role updated", "user_id": targetID, "role": req.Role})
}

// BanUser bans a user from the platform.
// @Summary      Ban user
// @Tags         Admin
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "User ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/users/{id}/ban [post]
func (h *AdminHandler) BanUser(c *gin.Context) {
	targetID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return
	}

	var req struct {
		Reason     string `json:"reason" binding:"required"`
		ShowReason bool   `json:"show_reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Reason) == "" {
		RespondError(c, http.StatusBadRequest, "Reason is required")
		return
	}

	adminID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	if err := h.userRepo.BanUser(c.Request.Context(), targetID, req.Reason, req.ShowReason, adminID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to ban user")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User banned", "user_id": targetID})
}

// ShadowBanUser shadow-bans a user (user sees content, others do not).
// @Summary      Shadow ban user
// @Tags         Admin
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "User ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/users/{id}/shadow-ban [post]
func (h *AdminHandler) ShadowBanUser(c *gin.Context) {
	targetID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return
	}

	var req struct {
		Reason     string `json:"reason" binding:"required"`
		ShowReason bool   `json:"show_reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Reason) == "" {
		RespondError(c, http.StatusBadRequest, "Reason is required")
		return
	}

	adminID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	if err := h.userRepo.ShadowBanUser(c.Request.Context(), targetID, req.Reason, req.ShowReason, adminID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to shadow ban user")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User shadow banned", "user_id": targetID})
}

// UnbanUser removes a ban from a user.
// @Summary      Unban user
// @Tags         Admin
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "User ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/users/{id}/unban [post]
func (h *AdminHandler) UnbanUser(c *gin.Context) {
	targetID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return
	}

	var req struct {
		Reason string `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Reason) == "" {
		RespondError(c, http.StatusBadRequest, "Reason is required")
		return
	}

	adminID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	if err := h.userRepo.UnbanUser(c.Request.Context(), targetID, req.Reason, adminID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unban user")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User unbanned", "user_id": targetID})
}

// SoftDeleteUser soft-deletes a user account.
// @Summary      Soft delete user
// @Tags         Admin
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "User ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/users/{id}/delete [post]
func (h *AdminHandler) SoftDeleteUser(c *gin.Context) {
	targetID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return
	}

	var req struct {
		Reason string `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Reason) == "" {
		RespondError(c, http.StatusBadRequest, "Reason is required")
		return
	}

	adminID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	if err := h.userRepo.SoftDeleteUser(c.Request.Context(), targetID, req.Reason, adminID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete user")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User soft deleted", "user_id": targetID})
}

// GetBanHistory returns ban history for a specific user.
// @Summary      Get user ban history
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "User ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/users/{id}/ban-history [get]
func (h *AdminHandler) GetBanHistory(c *gin.Context) {
	targetID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return
	}

	history, err := h.userRepo.GetBanHistory(c.Request.Context(), targetID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch ban history")
		return
	}

	c.JSON(http.StatusOK, gin.H{"history": history})
}

// GetAllBanHistory returns ban history across all users.
// @Summary      Get all ban history
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Param        limit   query  int     false  "Page size (default 50, max 200)"
// @Param        offset  query  int     false  "Offset"
// @Param        cursor  query  string  false  "Cursor for pagination"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/ban-history [get]
func (h *AdminHandler) GetAllBanHistory(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursorParam := c.Query("cursor")

	if limit > 200 {
		limit = 200
	}

	var cursor *timeCursor
	if cursorParam != "" {
		decoded, err := decodeTimeCursor(cursorParam)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
			return
		}
		cursor = decoded
	}
	useCursorPagination := cursorParam != "" || offset == 0
	limitArg := limit
	if useCursorPagination {
		limitArg = limit + 1
		offset = 0
	}

	var history []models.BanHistory
	var err error
	if useCursorPagination {
		var payload *models.TimeCursor
		if cursor != nil {
			payload = &models.TimeCursor{ID: cursor.ID, Timestamp: cursor.Timestamp}
		}
		history, err = h.userRepo.GetAllBanHistoryWithCursor(c.Request.Context(), limitArg, payload)
	} else {
		history, err = h.userRepo.GetAllBanHistory(c.Request.Context(), limitArg, offset)
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch ban history")
		return
	}

	// Get total count
	var totalCount int
	countQuery := "SELECT COUNT(*) FROM ban_history"
	if err := h.pool.QueryRow(c.Request.Context(), countQuery).Scan(&totalCount); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to count ban history")
		return
	}

	nextCursor := ""
	if useCursorPagination && len(history) > limit {
		history = history[:limit]
		if len(history) > 0 {
			last := history[len(history)-1]
			nextCursor = encodeTimeCursor(timeCursor{ID: last.ID, Timestamp: last.CreatedAt})
		}
	}

	response := gin.H{
		"history": history,
		"limit":   limit,
		"offset":  offset,
		"total":   totalCount,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
}

// ListUsers returns a paginated list of all users.
// @Summary      List users
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Param        limit   query  int     false  "Page size (default 20)"
// @Param        offset  query  int     false  "Offset"
// @Param        search  query  string  false  "Search by username or email"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/users [get]
func (h *AdminHandler) ListUsers(c *gin.Context) {
	search := c.Query("search")
	roleFilter := c.Query("role")
	statusFilter := c.Query("status") // "shadow_banned", "banned", "deleted", "active"
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursorParam := c.Query("cursor")

	if limit > 100 {
		limit = 100
	}

	var cursor *timeCursor
	if cursorParam != "" {
		decoded, err := decodeTimeCursor(cursorParam)
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

	// Build query dynamically with proper parameterization
	baseQuery := `
		SELECT id, username, email, reddit_id, role, created_at, last_seen, bio, avatar_url,
		       shadow_banned, banned, deleted, ban_reason, show_ban_reason, banned_at, banned_by
		FROM users
		WHERE 1=1
	`

	var conditions []string
	var args []interface{}
	paramCount := 1

	if search != "" {
		conditions = append(conditions, "(username ILIKE $"+strconv.Itoa(paramCount)+" OR email ILIKE $"+strconv.Itoa(paramCount)+")")
		args = append(args, "%"+search+"%")
		paramCount++
	}

	if roleFilter != "" {
		conditions = append(conditions, "role = $"+strconv.Itoa(paramCount))
		args = append(args, roleFilter)
		paramCount++
	}

	// Add status filter
	if statusFilter != "" {
		switch statusFilter {
		case "shadow_banned":
			conditions = append(conditions, "shadow_banned = true")
		case "banned":
			conditions = append(conditions, "banned = true")
		case "deleted":
			conditions = append(conditions, "deleted = true")
		case "active":
			conditions = append(conditions, "shadow_banned = false AND banned = false AND deleted = false")
		}
	}

	// Add conditions to query
	for _, cond := range conditions {
		baseQuery += " AND " + cond
	}

	// Get total count before pagination
	countQuery := "SELECT COUNT(*) FROM users WHERE 1=1"
	for _, cond := range conditions {
		countQuery += " AND " + cond
	}
	var totalCount int
	if err := h.pool.QueryRow(c.Request.Context(), countQuery, args...).Scan(&totalCount); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to count users")
		return
	}

	cursorClause, cursorArgs := buildTimeCursorClause("created_at", cursor, paramCount, "desc")
	baseQuery += cursorClause
	args = append(args, cursorArgs...)
	paramCount += len(cursorArgs)

	// Add ordering and pagination
	baseQuery += " ORDER BY created_at DESC, id DESC LIMIT $" + strconv.Itoa(paramCount) + " OFFSET $" + strconv.Itoa(paramCount+1)
	args = append(args, limitArg, offsetArg)

	rows, err := h.pool.Query(c.Request.Context(), baseQuery, args...)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch users")
		return
	}
	defer rows.Close()

	type userRow struct {
		ID            int
		Username      string
		Email         *string
		RedditID      *string
		Role          string
		CreatedAt     time.Time
		LastSeen      *time.Time
		Bio           *string
		AvatarURL     *string
		ShadowBanned  bool
		Banned        bool
		Deleted       bool
		BanReason     *string
		ShowBanReason bool
		BannedAt      *time.Time
		BannedBy      *int
	}
	type UserResponse struct {
		ID            int     `json:"id"`
		Username      string  `json:"username"`
		Email         *string `json:"email"`
		RedditID      *string `json:"reddit_id"`
		Role          string  `json:"role"`
		CreatedAt     string  `json:"created_at"`
		LastSeenAt    *string `json:"last_seen_at"`
		Bio           *string `json:"bio"`
		AvatarURL     *string `json:"avatar_url"`
		ShadowBanned  bool    `json:"shadow_banned"`
		Banned        bool    `json:"banned"`
		Deleted       bool    `json:"deleted"`
		BanReason     *string `json:"ban_reason"`
		ShowBanReason bool    `json:"show_ban_reason"`
		BannedAt      *string `json:"banned_at"`
		BannedBy      *int    `json:"banned_by"`
	}

	users := []UserResponse{}
	for rows.Next() {
		var row userRow
		if err := rows.Scan(&row.ID, &row.Username, &row.Email, &row.RedditID, &row.Role, &row.CreatedAt, &row.LastSeen, &row.Bio, &row.AvatarURL,
			&row.ShadowBanned, &row.Banned, &row.Deleted, &row.BanReason, &row.ShowBanReason, &row.BannedAt, &row.BannedBy); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to scan user")
			return
		}
		var lastSeenStr *string
		if row.LastSeen != nil {
			formatted := row.LastSeen.Format(time.RFC3339)
			lastSeenStr = &formatted
		}
		var bannedAtStr *string
		if row.BannedAt != nil {
			formatted := row.BannedAt.Format(time.RFC3339)
			bannedAtStr = &formatted
		}
		users = append(users, UserResponse{
			ID:            row.ID,
			Username:      row.Username,
			Email:         row.Email,
			RedditID:      row.RedditID,
			Role:          row.Role,
			CreatedAt:     row.CreatedAt.Format(time.RFC3339),
			LastSeenAt:    lastSeenStr,
			Bio:           row.Bio,
			AvatarURL:     row.AvatarURL,
			ShadowBanned:  row.ShadowBanned,
			Banned:        row.Banned,
			Deleted:       row.Deleted,
			BanReason:     row.BanReason,
			ShowBanReason: row.ShowBanReason,
			BannedAt:      bannedAtStr,
			BannedBy:      row.BannedBy,
		})
	}

	nextCursor := ""
	if useCursorPagination && len(users) > limit {
		users = users[:limit]
		if len(users) > 0 {
			last := users[len(users)-1]
			createdAt, _ := time.Parse(time.RFC3339, last.CreatedAt)
			nextCursor = encodeTimeCursor(timeCursor{ID: last.ID, Timestamp: createdAt})
		}
	}

	response := gin.H{
		"users":  users,
		"limit":  limit,
		"offset": offset,
		"total":  totalCount,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
}

// GetSiteStats returns platform-wide statistics.
// @Summary      Get site statistics
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/stats [get]
func (h *AdminHandler) GetSiteStats(c *gin.Context) {
	type Stats struct {
		TotalUsers               int     `json:"total_users"`
		TotalPosts               int     `json:"total_posts"`
		TotalComments            int     `json:"total_comments"`
		TotalHubs                int     `json:"total_hubs"`
		TotalConversations       int     `json:"total_conversations"`
		TotalMessages            int     `json:"total_messages"`
		TotalReports             int     `json:"total_reports"`
		OpenReports              int     `json:"open_reports"`
		ApprovedReports          int     `json:"approved_reports"`
		RejectedReports          int     `json:"rejected_reports"`
		NoActionReports          int     `json:"no_action_reports"`
		ReviewedReports          int     `json:"reviewed_reports"`
		DismissedReports         int     `json:"dismissed_reports"`
		FalseReportRatePct       float64 `json:"false_report_rate_pct"`
		AvgReportResolutionHours float64 `json:"avg_report_resolution_hours"`
		AdminCount               int     `json:"admin_count"`
		ModeratorCount           int     `json:"moderator_count"`
	}

	stats := Stats{}

	// Get all stats in parallel queries
	queries := map[string]*int{
		`SELECT COUNT(*) FROM users`:                         &stats.TotalUsers,
		`SELECT COUNT(*) FROM platform_posts`:                &stats.TotalPosts,
		`SELECT COUNT(*) FROM post_comments`:                 &stats.TotalComments,
		`SELECT COUNT(*) FROM hubs`:                          &stats.TotalHubs,
		`SELECT COUNT(*) FROM conversations`:                 &stats.TotalConversations,
		`SELECT COUNT(*) FROM messages`:                      &stats.TotalMessages,
		`SELECT COUNT(*) FROM reports`:                       &stats.TotalReports,
		`SELECT COUNT(*) FROM users WHERE role = 'admin'`:    &stats.AdminCount,
		`SELECT COUNT(DISTINCT user_id) FROM hub_moderators`: &stats.ModeratorCount,
	}

	// Execute all stat queries concurrently for better performance
	type queryResult struct {
		query  string
		target *int
		err    error
	}

	resultsChan := make(chan queryResult, len(queries))
	ctx := c.Request.Context()

	for query, target := range queries {
		go func(q string, t *int) {
			err := h.pool.QueryRow(ctx, q).Scan(t)
			resultsChan <- queryResult{query: q, target: t, err: err}
		}(query, target)
	}

	// Collect results
	for i := 0; i < len(queries); i++ {
		result := <-resultsChan
		if result.err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch stats")
			return
		}
	}

	if err := h.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status = 'open'),
			COUNT(*) FILTER (WHERE status = 'approved'),
			COUNT(*) FILTER (WHERE status = 'rejected'),
			COUNT(*) FILTER (WHERE status = 'no_action'),
			COUNT(*) FILTER (WHERE status = 'reviewed'),
			COUNT(*) FILTER (WHERE status = 'dismissed')
		FROM reports
	`).Scan(
		&stats.OpenReports,
		&stats.ApprovedReports,
		&stats.RejectedReports,
		&stats.NoActionReports,
		&stats.ReviewedReports,
		&stats.DismissedReports,
	); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch report status stats")
		return
	}

	if err := h.pool.QueryRow(ctx, `
		SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) / 3600.0, 0)
		FROM reports
		WHERE resolved_at IS NOT NULL
	`).Scan(&stats.AvgReportResolutionHours); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch average report resolution time")
		return
	}

	resolvedCount := stats.ApprovedReports + stats.RejectedReports + stats.NoActionReports + stats.ReviewedReports + stats.DismissedReports
	if resolvedCount > 0 {
		stats.FalseReportRatePct = (float64(stats.RejectedReports) / float64(resolvedCount)) * 100.0
	}

	c.JSON(http.StatusOK, stats)
}

// GetHubModerators returns the list of moderators for a hub.
// @Summary      Get hub moderators
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Param        hub_id  path  int  true  "Hub ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/hubs/{hub_id}/moderators [get]
func (h *AdminHandler) GetHubModerators(c *gin.Context) {
	hubID, err := strconv.Atoi(c.Param("hub_id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid hub ID")
		return
	}

	query := `
		SELECT hm.id, hm.user_id, hm.hub_id, hm.added_by, hm.added_at, u.username
		FROM hub_moderators hm
		JOIN users u ON hm.user_id = u.id
		WHERE hm.hub_id = $1
		ORDER BY hm.added_at ASC
	`

	rows, err := h.pool.Query(c.Request.Context(), query, hubID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch moderators")
		return
	}
	defer rows.Close()

	type ModeratorResponse struct {
		ID       int    `json:"id"`
		UserID   int    `json:"user_id"`
		HubID    int    `json:"hub_id"`
		AddedBy  int    `json:"added_by"`
		AddedAt  string `json:"added_at"`
		Username string `json:"username"`
	}

	moderators := []ModeratorResponse{}
	for rows.Next() {
		var m ModeratorResponse
		if err := rows.Scan(&m.ID, &m.UserID, &m.HubID, &m.AddedBy, &m.AddedAt, &m.Username); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to scan moderator")
			return
		}
		moderators = append(moderators, m)
	}

	c.JSON(http.StatusOK, gin.H{"moderators": moderators})
}

// RemoveHubModerator removes a moderator from a hub.
// @Summary      Remove hub moderator
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Param        hub_id   path  int  true  "Hub ID"
// @Param        user_id  path  int  true  "User ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/hubs/{hub_id}/moderators/{user_id} [delete]
func (h *AdminHandler) RemoveHubModerator(c *gin.Context) {
	hubID, err := strconv.Atoi(c.Param("hub_id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid hub ID")
		return
	}

	userID, err := strconv.Atoi(c.Param("user_id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return
	}

	if err := h.hubModRepo.RemoveModerator(c.Request.Context(), hubID, userID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to remove moderator")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Moderator removed"})
}

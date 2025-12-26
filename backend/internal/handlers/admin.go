package handlers

import (
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/gin-gonic/gin"
)

// AdminHandler handles admin-level actions
type AdminHandler struct {
	userRepo   *models.UserRepository
	hubModRepo *models.HubModeratorRepository
	pool       *pgxpool.Pool
}

// NewAdminHandler creates a new admin handler
func NewAdminHandler(userRepo *models.UserRepository, hubModRepo *models.HubModeratorRepository, pool *pgxpool.Pool) *AdminHandler {
	return &AdminHandler{
		userRepo:   userRepo,
		hubModRepo: hubModRepo,
		pool:       pool,
	}
}

// PromoteUser handles POST /api/v1/admin/users/:id/role
func (h *AdminHandler) PromoteUser(c *gin.Context) {
	targetID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	switch req.Role {
	case "user", "moderator", "admin":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid role"})
		return
	}

	if err := h.userRepo.UpdateRole(c.Request.Context(), targetID, req.Role); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update role", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Role updated", "user_id": targetID, "role": req.Role})
}

// ListUsers handles GET /api/v1/admin/users
func (h *AdminHandler) ListUsers(c *gin.Context) {
	search := c.Query("search")
	roleFilter := c.Query("role")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit > 100 {
		limit = 100
	}

	// Build query dynamically with proper parameterization
	baseQuery := `
		SELECT id, username, email, reddit_id, role, created_at, last_seen_at, bio, avatar_url
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

	// Add conditions to query
	for _, cond := range conditions {
		baseQuery += " AND " + cond
	}

	// Add ordering and pagination
	baseQuery += " ORDER BY created_at DESC LIMIT $" + strconv.Itoa(paramCount) + " OFFSET $" + strconv.Itoa(paramCount+1)
	args = append(args, limit, offset)

	rows, err := h.pool.Query(c.Request.Context(), baseQuery, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users", "details": err.Error()})
		return
	}
	defer rows.Close()

	type UserResponse struct {
		ID         int     `json:"id"`
		Username   string  `json:"username"`
		Email      string  `json:"email"`
		RedditID   *string `json:"reddit_id"`
		Role       string  `json:"role"`
		CreatedAt  string  `json:"created_at"`
		LastSeenAt *string `json:"last_seen_at"`
		Bio        *string `json:"bio"`
		AvatarURL  *string `json:"avatar_url"`
	}

	users := []UserResponse{}
	for rows.Next() {
		var u UserResponse
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.RedditID, &u.Role, &u.CreatedAt, &u.LastSeenAt, &u.Bio, &u.AvatarURL); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan user", "details": err.Error()})
			return
		}
		users = append(users, u)
	}

	c.JSON(http.StatusOK, gin.H{
		"users":  users,
		"limit":  limit,
		"offset": offset,
	})
}

// GetSiteStats handles GET /api/v1/admin/stats
func (h *AdminHandler) GetSiteStats(c *gin.Context) {
	type Stats struct {
		TotalUsers         int `json:"total_users"`
		TotalPosts         int `json:"total_posts"`
		TotalComments      int `json:"total_comments"`
		TotalHubs          int `json:"total_hubs"`
		TotalConversations int `json:"total_conversations"`
		TotalMessages      int `json:"total_messages"`
		TotalReports       int `json:"total_reports"`
		AdminCount         int `json:"admin_count"`
		ModeratorCount     int `json:"moderator_count"`
	}

	stats := Stats{}

	// Get all stats in parallel queries
	queries := map[string]*int{
		`SELECT COUNT(*) FROM users`:                      &stats.TotalUsers,
		`SELECT COUNT(*) FROM platform_posts`:             &stats.TotalPosts,
		`SELECT COUNT(*) FROM post_comments`:              &stats.TotalComments,
		`SELECT COUNT(*) FROM hubs`:                       &stats.TotalHubs,
		`SELECT COUNT(*) FROM conversations`:              &stats.TotalConversations,
		`SELECT COUNT(*) FROM messages`:                   &stats.TotalMessages,
		`SELECT COUNT(*) FROM reports`:                    &stats.TotalReports,
		`SELECT COUNT(*) FROM users WHERE role = 'admin'`: &stats.AdminCount,
		`SELECT COUNT(DISTINCT user_id) FROM hub_moderators`: &stats.ModeratorCount,
	}

	for query, target := range queries {
		if err := h.pool.QueryRow(c.Request.Context(), query).Scan(target); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch stats", "details": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, stats)
}

// GetHubModerators handles GET /api/v1/admin/hubs/:hub_id/moderators
func (h *AdminHandler) GetHubModerators(c *gin.Context) {
	hubID, err := strconv.Atoi(c.Param("hub_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hub ID"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch moderators", "details": err.Error()})
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
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan moderator", "details": err.Error()})
			return
		}
		moderators = append(moderators, m)
	}

	c.JSON(http.StatusOK, gin.H{"moderators": moderators})
}

// RemoveHubModerator handles DELETE /api/v1/admin/hubs/:hub_id/moderators/:user_id
func (h *AdminHandler) RemoveHubModerator(c *gin.Context) {
	hubID, err := strconv.Atoi(c.Param("hub_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hub ID"})
		return
	}

	userID, err := strconv.Atoi(c.Param("user_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if err := h.hubModRepo.RemoveModerator(c.Request.Context(), hubID, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove moderator", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Moderator removed"})
}

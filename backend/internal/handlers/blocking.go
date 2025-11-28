package handlers

import (
	"net/http"
	"time"

	"github.com/chatreddit/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BlockingHandler handles user blocking/unblocking
type BlockingHandler struct {
	pool     *pgxpool.Pool
	userRepo *models.UserRepository
}

// NewBlockingHandler creates a new blocking handler
func NewBlockingHandler(pool *pgxpool.Pool, userRepo *models.UserRepository) *BlockingHandler {
	return &BlockingHandler{
		pool:     pool,
		userRepo: userRepo,
	}
}

type blockUserRequest struct {
	Username string `json:"username" binding:"required"`
}

// BlockUser blocks a user
// POST /api/v1/users/block
func (h *BlockingHandler) BlockUser(c *gin.Context) {
	blockerID := c.GetInt("user_id")

	var req blockUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Get user to block
	blockedUser, err := h.userRepo.GetByUsername(c.Request.Context(), req.Username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Can't block yourself
	if blockedUser.ID == blockerID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot block yourself"})
		return
	}

	// Block the user
	query := `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
		ON CONFLICT (blocker_id, blocked_id) DO NOTHING
	`

	_, err = h.pool.Exec(c.Request.Context(), query, blockerID, blockedUser.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to block user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User blocked successfully"})
}

// UnblockUser unblocks a user
// DELETE /api/v1/users/block/:username
func (h *BlockingHandler) UnblockUser(c *gin.Context) {
	blockerID := c.GetInt("user_id")
	username := c.Param("username")

	// Get user to unblock
	blockedUser, err := h.userRepo.GetByUsername(c.Request.Context(), username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Unblock the user
	query := `
		DELETE FROM blocked_users
		WHERE blocker_id = $1 AND blocked_id = $2
	`

	result, err := h.pool.Exec(c.Request.Context(), query, blockerID, blockedUser.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unblock user"})
		return
	}

	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "User was not blocked"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User unblocked successfully"})
}

// GetBlockedUsers returns list of blocked users
// GET /api/v1/users/blocked
func (h *BlockingHandler) GetBlockedUsers(c *gin.Context) {
	blockerID := c.GetInt("user_id")

	query := `
		SELECT u.id, u.username, u.avatar_url, bu.blocked_at
		FROM blocked_users bu
		JOIN users u ON bu.blocked_id = u.id
		WHERE bu.blocker_id = $1
		ORDER BY bu.blocked_at DESC
	`

	rows, err := h.pool.Query(c.Request.Context(), query, blockerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch blocked users"})
		return
	}
	defer rows.Close()

	type blockedUser struct {
		ID        int       `json:"id"`
		Username  string    `json:"username"`
		AvatarURL *string   `json:"avatar_url"`
		BlockedAt time.Time `json:"blocked_at"`
	}

	var blockedUsers []blockedUser
	for rows.Next() {
		var bu blockedUser
		if err := rows.Scan(&bu.ID, &bu.Username, &bu.AvatarURL, &bu.BlockedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse results"})
			return
		}
		blockedUsers = append(blockedUsers, bu)
	}

	c.JSON(http.StatusOK, gin.H{"blocked_users": blockedUsers})
}

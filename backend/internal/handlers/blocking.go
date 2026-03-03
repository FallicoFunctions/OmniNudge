package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BlockingHandler handles user blocking/unblocking
type BlockingHandler struct {
	pool     *pgxpool.Pool
	userRepo ports.UserRepository
}

// NewBlockingHandler creates a new blocking handler
func NewBlockingHandler(pool *pgxpool.Pool, userRepo ports.UserRepository) *BlockingHandler {
	return &BlockingHandler{
		pool:     pool,
		userRepo: userRepo,
	}
}

type blockUserRequest struct {
	Username string `json:"username" binding:"required"`
}

// BlockUser blocks another user.
// @Summary      Block user
// @Tags         Users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/block [post]
func (h *BlockingHandler) BlockUser(c *gin.Context) {
	blockerID := c.GetInt("user_id")

	var req blockUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	// Get user to block
	blockedUser, err := h.userRepo.GetByUsername(c.Request.Context(), req.Username)
	if err != nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	// Can't block yourself
	if blockedUser.ID == blockerID {
		RespondError(c, http.StatusBadRequest, "Cannot block yourself")
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
		RespondError(c, http.StatusInternalServerError, "Failed to block user")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User blocked successfully"})
}

// UnblockUser removes a block on another user.
// @Summary      Unblock user
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Param        username  path  string  true  "Username to unblock"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/block/{username} [delete]
func (h *BlockingHandler) UnblockUser(c *gin.Context) {
	blockerID := c.GetInt("user_id")
	username := c.Param("username")

	// Get user to unblock
	blockedUser, err := h.userRepo.GetByUsername(c.Request.Context(), username)
	if err != nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	// Unblock the user
	query := `
		DELETE FROM blocked_users
		WHERE blocker_id = $1 AND blocked_id = $2
	`

	result, err := h.pool.Exec(c.Request.Context(), query, blockerID, blockedUser.ID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unblock user")
		return
	}

	if result.RowsAffected() == 0 {
		RespondError(c, http.StatusNotFound, "User was not blocked")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User unblocked successfully"})
}

// GetBlockedUsers returns the list of blocked users.
// @Summary      Get blocked users
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/blocked [get]
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
		RespondError(c, http.StatusInternalServerError, "Failed to fetch blocked users")
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
			RespondError(c, http.StatusInternalServerError, "Failed to parse results")
			return
		}
		blockedUsers = append(blockedUsers, bu)
	}

	c.JSON(http.StatusOK, gin.H{"blocked_users": blockedUsers})
}

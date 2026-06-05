package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
)

// UserStatusHandler handles user online/offline status requests
type UserStatusHandler struct {
	hub  HubInterface
	pool *pgxpool.Pool
}

// NewUserStatusHandler creates a new user status handler
func NewUserStatusHandler(hub HubInterface, pool *pgxpool.Pool) *UserStatusHandler {
	return &UserStatusHandler{
		hub:  hub,
		pool: pool,
	}
}

// GetUserStatus handles GET /api/v1/users/:username/status.
// @Summary      Get single user online status
// @Tags         Users
// @Produce      json
// @Param        username  path      string  true  "Username"
// @Success      501       {object}  gin.H
// @Router       /users/{username}/status [get]
func (h *UserStatusHandler) GetUserStatus(c *gin.Context) {
	// For this endpoint, we need to convert username to user ID
	// This would require a user repository lookup
	// For now, we'll implement the bulk status check which is more useful
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": "Use /api/v1/users/status endpoint with user_ids parameter instead",
	})
}

// GetUsersStatus handles GET /api/v1/users/status?user_ids=1,2,3.
// @Summary      Get multiple users online status
// @Tags         Users
// @Produce      json
// @Param        user_ids  query     string  true  "Comma-separated user IDs"
// @Success      200       {object}  gin.H
// @Failure      400       {object}  gin.H
// @Router       /users/status [get]
func (h *UserStatusHandler) GetUsersStatus(c *gin.Context) {
	userIDsStr := c.Query("user_ids")
	if userIDsStr == "" {
		RespondError(c, http.StatusBadRequest, "user_ids parameter is required")
		return
	}

	// Parse comma-separated user IDs
	userIDStrings := strings.Split(userIDsStr, ",")
	var userIDs []int
	for _, idStr := range userIDStrings {
		id, err := strconv.Atoi(strings.TrimSpace(idStr))
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid user ID format")
			return
		}
		userIDs = append(userIDs, id)
	}

	// Limit to prevent abuse
	if len(userIDs) > 100 {
		RespondError(c, http.StatusBadRequest, "Maximum 100 user IDs allowed")
		return
	}

	// Point 9: resolve the requester and build a block-set so we never
	// reveal online status to or from a user who has been blocked.
	requesterID, _ := middleware.GetOptionalUserID(c)
	var blockedByRequester map[int]struct{}
	if requesterID != 0 && h.pool != nil {
		var blockErr error
		_, blockedByRequester, blockErr = models.GetAllBlockedIDs(c.Request.Context(), h.pool, requesterID)
		if blockErr != nil {
			// Fail closed on status: omit all requested IDs rather than leaking
			// online presence during a DB error.
			c.JSON(http.StatusOK, gin.H{"statuses": map[int]bool{}})
			return
		}
	}

	// Check status for each user, omitting blocked users entirely.
	statuses := make(map[int]bool)
	for _, userID := range userIDs {
		if requesterID != 0 {
			if _, blocked := blockedByRequester[userID]; blocked {
				// Omit blocked user — absence is indistinguishable from offline.
				continue
			}
		}
		statuses[userID] = h.hub.IsUserOnline(userID)
	}

	c.JSON(http.StatusOK, gin.H{
		"statuses": statuses,
	})
}

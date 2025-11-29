package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// UserStatusHandler handles user online/offline status requests
type UserStatusHandler struct {
	hub HubInterface
}

// NewUserStatusHandler creates a new user status handler
func NewUserStatusHandler(hub HubInterface) *UserStatusHandler {
	return &UserStatusHandler{
		hub: hub,
	}
}

// GetUserStatus handles GET /api/v1/users/:username/status
func (h *UserStatusHandler) GetUserStatus(c *gin.Context) {
	// For this endpoint, we need to convert username to user ID
	// This would require a user repository lookup
	// For now, we'll implement the bulk status check which is more useful
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": "Use /api/v1/users/status endpoint with user_ids parameter instead",
	})
}

// GetUsersStatus handles GET /api/v1/users/status?user_ids=1,2,3
func (h *UserStatusHandler) GetUsersStatus(c *gin.Context) {
	userIDsStr := c.Query("user_ids")
	if userIDsStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_ids parameter is required"})
		return
	}

	// Parse comma-separated user IDs
	userIDStrings := strings.Split(userIDsStr, ",")
	var userIDs []int
	for _, idStr := range userIDStrings {
		id, err := strconv.Atoi(strings.TrimSpace(idStr))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID format"})
			return
		}
		userIDs = append(userIDs, id)
	}

	// Limit to prevent abuse
	if len(userIDs) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Maximum 100 user IDs allowed"})
		return
	}

	// Check status for each user
	statuses := make(map[int]bool)
	for _, userID := range userIDs {
		statuses[userID] = h.hub.IsUserOnline(userID)
	}

	c.JSON(http.StatusOK, gin.H{
		"statuses": statuses,
	})
}

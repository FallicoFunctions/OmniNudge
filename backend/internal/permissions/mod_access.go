package permissions

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/ports"
)

func IsAdminContext(c *gin.Context) bool {
	roleVal, exists := c.Get("role")
	if exists {
		if role, ok := roleVal.(string); ok && role == "admin" {
			return true
		}
	}
	roleVal, exists = c.Get("user_role")
	if exists {
		if role, ok := roleVal.(string); ok && role == "admin" {
			return true
		}
	}
	return false
}

func RequireHubModeratorOrAdmin(c *gin.Context, hubID int, hubModRepo ports.HubModeratorRepository) (bool, error) {
	if IsAdminContext(c) {
		return true, nil
	}
	userID, exists := c.Get("user_id")
	if !exists {
		return false, errors.New("missing user_id")
	}
	return hubModRepo.IsModerator(c.Request.Context(), hubID, userID.(int))
}

func RequireHubModeratorOrAdminByName(
	c *gin.Context,
	hubName string,
	hubRepo ports.HubRepository,
	hubModRepo ports.HubModeratorRepository,
) (int, bool, error) {
	hub, err := hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		return 0, false, err
	}
	if hub == nil {
		return 0, false, nil
	}
	ok, err := RequireHubModeratorOrAdmin(c, hub.ID, hubModRepo)
	return hub.ID, ok, err
}

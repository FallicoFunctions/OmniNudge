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
	userID, ok := c.Get("user_id")
	if !ok {
		return false, errors.New("missing user_id")
	}
	uid, ok := userID.(int)
	if !ok {
		return false, errors.New("invalid user_id")
	}
	return hubModRepo.IsModerator(c.Request.Context(), hubID, uid)
}

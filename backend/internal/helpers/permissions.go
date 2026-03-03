package helpers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	apiresponse "github.com/omninudge/backend/internal/api/response"
	"github.com/omninudge/backend/internal/models"
)

// ModeratorChecker interface for checking moderator permissions
type ModeratorChecker interface {
	GetModeratorRole(ctx context.Context, hubID, userID int) (*models.ModeratorRole, error)
	IsModerator(ctx context.Context, hubID, userID int) (bool, error)
}

// CheckHubModerator checks if a user is a moderator of a hub.
// Returns true if user is a moderator, false otherwise.
func CheckHubModerator(ctx context.Context, modRepo ModeratorChecker, hubID, userID int) bool {
	if modRepo == nil {
		return false
	}

	isMod, err := modRepo.IsModerator(ctx, hubID, userID)
	if err != nil {
		return false
	}

	return isMod
}

// RequireModeratorRole checks if a user has moderator access and returns their role.
// Writes error response if user is not a moderator.
// Returns the role and true if authorized, or nil and false if not.
func RequireModeratorRole(c *gin.Context, modRepo ModeratorChecker, hubID, userID int) (*models.ModeratorRole, bool) {
	role, err := modRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
	if err != nil || role == nil {
		apiresponse.WriteError(c, http.StatusForbidden, "Not a moderator")
		return nil, false
	}
	return role, true
}

// RequireModeratorRoleLevel checks if a user has one of the required moderator roles.
// Writes error response if user doesn't have required permissions.
// Returns true if authorized, false otherwise.
func RequireModeratorRoleLevel(c *gin.Context, role *models.ModeratorRole, allowedRoles []models.ModeratorRole, errorMsg string) bool {
	if role == nil {
		apiresponse.WriteError(c, http.StatusForbidden, "Not a moderator")
		return false
	}

	for _, allowedRole := range allowedRoles {
		if *role == allowedRole {
			return true
		}
	}

	if errorMsg == "" {
		errorMsg = "Insufficient permissions"
	}
	apiresponse.WriteError(c, http.StatusForbidden, errorMsg)
	return false
}

// IsOwnerOrFullModerator checks if the role is owner or full_moderator
func IsOwnerOrFullModerator(role *models.ModeratorRole) bool {
	if role == nil {
		return false
	}
	return *role == models.ModeratorRoleOwner || *role == models.ModeratorRoleFullModerator
}

// GetUserRole extracts the user role from context (typically set by auth middleware)
func GetUserRole(c *gin.Context) string {
	if role, exists := c.Get("role"); exists {
		if roleStr, ok := role.(string); ok {
			return roleStr
		}
	}
	return ""
}

// IsAdmin checks if the user has admin role
func IsAdmin(c *gin.Context) bool {
	return GetUserRole(c) == "admin"
}

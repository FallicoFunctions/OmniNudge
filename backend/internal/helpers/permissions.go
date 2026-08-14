package helpers

import "github.com/gin-gonic/gin"

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

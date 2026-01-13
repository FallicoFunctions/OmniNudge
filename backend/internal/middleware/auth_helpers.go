package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetAuthenticatedUserID extracts and validates user_id from the gin context.
// Returns the user ID and true if authenticated, or writes an error response and returns 0, false.
func GetAuthenticatedUserID(c *gin.Context) (int, bool) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return 0, false
	}

	uid, ok := userID.(int)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user context"})
		return 0, false
	}

	return uid, true
}

// GetOptionalUserID extracts user_id from the gin context without requiring authentication.
// Returns the user ID and true if present, or 0 and false if not present (without writing an error).
func GetOptionalUserID(c *gin.Context) (int, bool) {
	userID, exists := c.Get("user_id")
	if !exists {
		return 0, false
	}

	uid, ok := userID.(int)
	if !ok {
		return 0, false
	}

	return uid, true
}

package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetAuthenticatedUserID extracts the authenticated user ID from the gin context.
// If the user is not authenticated it writes a 401 response and returns (0, false).
// Handlers should return immediately when ok is false.
//
// Replaces the 95+ duplicated patterns of:
//
//	userID, exists := c.Get("user_id")
//	if !exists { c.JSON(401, ...); return }
//	uid := userID.(int)
func GetAuthenticatedUserID(c *gin.Context) (int, bool) {
	val, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return 0, false
	}
	// claims.UserID is stored as int by AuthRequired middleware (services.JWTClaims.UserID int).
	return val.(int), true
}

// GetOptionalUserID extracts the user ID from the gin context without requiring
// authentication. Returns (0, false) when the user is not authenticated.
func GetOptionalUserID(c *gin.Context) (int, bool) {
	val, exists := c.Get("user_id")
	if !exists {
		return 0, false
	}
	return val.(int), true
}

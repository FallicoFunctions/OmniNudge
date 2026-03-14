package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	apiresponse "github.com/omninudge/backend/internal/api/response"
)

// GetAuthenticatedUserID extracts the authenticated user ID from the gin context.
// If the user is not authenticated, or the stored value is not an int, it writes
// a 401 response and returns (0, false).
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
		apiresponse.WriteError(c, http.StatusUnauthorized, "User not authenticated")
		return 0, false
	}
	// claims.UserID is stored as int by AuthRequired middleware (services.JWTClaims.UserID int).
	// Use a safe assertion so a malformed context value yields 401 rather than a panic.
	uid, ok := val.(int)
	if !ok {
		apiresponse.WriteError(c, http.StatusUnauthorized, "User not authenticated")
		return 0, false
	}
	return uid, true
}

// GetOptionalUserID extracts the user ID from the gin context without requiring
// authentication. Returns (0, false) when the user is not authenticated or when
// the stored value is not an int.
func GetOptionalUserID(c *gin.Context) (int, bool) {
	val, exists := c.Get("user_id")
	if !exists {
		return 0, false
	}
	uid, ok := val.(int)
	if !ok {
		return 0, false
	}
	return uid, true
}

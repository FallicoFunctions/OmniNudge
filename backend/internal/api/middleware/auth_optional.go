package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
)

// AuthOptional attempts to authenticate the request but never blocks if auth fails.
// If a valid Bearer token is provided, user context keys are populated.
func AuthOptional(authService *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		var tokenString string
		cookieAuth := false
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				c.Next()
				return
			}
			tokenString = parts[1]
		}
		if tokenString == "" {
			if cookieToken, err := c.Cookie(services.AccessTokenCookieName); err == nil && cookieToken != "" {
				tokenString = cookieToken
				cookieAuth = true
			}
		}
		if tokenString == "" {
			c.Next()
			return
		}
		claims, err := authService.ValidateJWTContext(c.Request.Context(), tokenString)
		if err != nil || claims.Use == "ws" {
			// Ignore invalid tokens in optional mode
			c.Next()
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Set("session_id", claims.SessionID)
		c.Set("auth_via_cookie", cookieAuth)
		c.Next()
	}
}

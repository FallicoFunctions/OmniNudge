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
		if authHeader == "" {
			c.Next()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.Next()
			return
		}

		tokenString := parts[1]
		claims, err := authService.ValidateJWT(tokenString)
		if err != nil {
			// Ignore invalid tokens in optional mode
			c.Next()
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("reddit_id", claims.RedditID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Next()
	}
}

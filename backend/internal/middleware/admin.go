package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	apiresponse "github.com/omninudge/backend/internal/api/response"
)

// AdminRequired middleware ensures the user has admin role
func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Check if user is authenticated
		_, exists := c.Get("user_id")
		if !exists {
			apiresponse.WriteError(c, http.StatusUnauthorized, "Unauthorized")
			c.Abort()
			return
		}

		// Check if user has admin role (set by auth middleware)
		roleVal, exists := c.Get("role")
		if !exists {
			roleVal, exists = c.Get("user_role")
		}

		if exists {
			if role, ok := roleVal.(string); ok && role == "admin" {
				c.Next()
				return
			}
		}

		apiresponse.WriteError(c, http.StatusForbidden, "Forbidden: Admin access required")
		c.Abort()
	}
}

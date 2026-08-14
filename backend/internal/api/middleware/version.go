package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// APIVersion middleware adds API version information to responses
// and extracts version from request path
func APIVersion() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Extract version from path (/api/v1/... or /api/v2/...)
		path := c.Request.URL.Path
		version := "1" // Default to v1

		if strings.HasPrefix(path, "/api/v1") {
			version = "1"
		} else if strings.HasPrefix(path, "/api/v2") {
			version = "2"
		}

		// Store in context for handlers
		c.Set("api_version", version)

		// Add version headers to response
		c.Header("X-API-Version", version)
		c.Header("X-API-Latest-Version", "1") // Update when v2 is released

		c.Next()
	}
}

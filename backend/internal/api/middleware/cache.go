package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// CacheControl middleware sets appropriate caching headers
func CacheControl() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path

		// Determine cache strategy by path
		if strings.HasPrefix(path, "/uploads/") {
			// Uploads are private by default. The ownership-aware upload handler
			// opts only untracked public profile assets into shared caching after
			// it has resolved the path.
			c.Header("Cache-Control", "private, no-store")
			c.Header("Pragma", "no-cache")
			c.Header("Expires", "0")
		} else if strings.HasPrefix(path, "/api/") {
			// API responses: no cache (or short cache for specific endpoints)
			if strings.HasPrefix(path, "/api/v1/users/") && c.Request.Method == "GET" {
				// User profiles: cache for 5 minutes
				c.Header("Cache-Control", "private, max-age=300")
			} else {
				// Default: no cache
				c.Header("Cache-Control", "no-store, no-cache, must-revalidate")
				c.Header("Pragma", "no-cache")
				c.Header("Expires", "0")
			}
		}

		c.Next()

	}
}

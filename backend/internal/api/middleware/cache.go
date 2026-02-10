package middleware

import (
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// CacheControl middleware sets appropriate caching headers
func CacheControl() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path

		// Determine cache strategy by path
		if strings.HasPrefix(path, "/uploads/") {
			// Static files: cache for 7 days
			c.Header("Cache-Control", "public, max-age=604800, immutable")
			c.Header("Expires", time.Now().Add(7*24*time.Hour).Format(time.RFC1123))
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

		// Add ETag for cacheable responses
		if c.Writer.Status() == 200 && shouldAddETag(path) {
			// TODO: Generate ETag from response body hash
			// c.Header("ETag", generateETag(responseBody))
		}
	}
}

func shouldAddETag(path string) bool {
	// Add ETag for static files and GET endpoints
	return strings.HasPrefix(path, "/uploads/") || strings.HasPrefix(path, "/api/v1/users/")
}

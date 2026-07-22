package monitoring

import (
	"time"

	"github.com/gin-gonic/gin"
)

// MetricsMiddleware records HTTP request metrics
func MetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Process request
		c.Next()

		// Record metrics after request completes
		duration := time.Since(start)
		method := c.Request.Method
		path := c.FullPath() // Use route pattern, not actual path (for better grouping)
		if path == "" {
			path = c.Request.URL.Path // Fallback for unmatched routes
		}
		status := c.Writer.Status()

		RecordHTTPRequest(method, path, status, duration)
	}
}

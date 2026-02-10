package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const RequestIDHeader = "X-Request-ID"

// RequestID middleware generates or extracts request ID
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Try to get request ID from header (for distributed tracing)
		requestID := c.GetHeader(RequestIDHeader)

		// Generate new ID if not present
		if requestID == "" {
			requestID = uuid.New().String()
		}

		// Store in context
		c.Set("request_id", requestID)

		// Return in response header
		c.Header(RequestIDHeader, requestID)

		c.Next()
	}
}

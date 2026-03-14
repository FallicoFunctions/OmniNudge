package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const RequestIDHeader = "X-Request-ID"
const RequestIDKey = "request_id"

// RequestID injects a unique request ID into every request context.
// Reuses the client-supplied X-Request-ID header if it is a valid UUID;
// otherwise generates a new one. The resolved ID is echoed back in the
// X-Request-ID response header so clients can correlate requests with logs.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader(RequestIDHeader)

		// Only reuse the client-supplied ID if it is a valid UUID.
		// This prevents request forgery through crafted ID headers while
		// still allowing distributed tracing across services.
		if _, err := uuid.Parse(requestID); err != nil {
			requestID = uuid.New().String()
		}

		c.Set(RequestIDKey, requestID)
		c.Header(RequestIDHeader, requestID)
		c.Next()
	}
}

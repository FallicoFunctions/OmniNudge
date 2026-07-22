package response

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// ErrorResponse is the standard error payload returned by all API endpoints.
type ErrorResponse struct {
	// Error is retained for backward compatibility with existing clients that
	// still read `error` instead of `message`.
	Error     string `json:"error,omitempty"`
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}

// RequestIDFromContext extracts request_id from the gin context when present.
func RequestIDFromContext(c *gin.Context) string {
	if v, ok := c.Get("request_id"); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// CodeFromStatus maps HTTP status codes to machine-readable API error codes.
func CodeFromStatus(status int) string {
	switch status {
	case http.StatusBadRequest:
		return "bad_request"
	case http.StatusUnauthorized:
		return "unauthorized"
	case http.StatusForbidden:
		return "forbidden"
	case http.StatusNotFound:
		return "not_found"
	case http.StatusConflict:
		return "conflict"
	case http.StatusTooManyRequests:
		return "rate_limited"
	case http.StatusRequestEntityTooLarge:
		return "payload_too_large"
	case http.StatusUnprocessableEntity:
		return "validation_error"
	case http.StatusServiceUnavailable:
		return "service_unavailable"
	default:
		if status >= 500 {
			return "internal_error"
		}
		return "error"
	}
}

// NewErrorResponse builds the canonical API error payload.
func NewErrorResponse(status int, message string, requestID string) ErrorResponse {
	trimmed := strings.TrimSpace(message)
	return ErrorResponse{
		Error:     trimmed,
		Code:      CodeFromStatus(status),
		Message:   trimmed,
		RequestID: requestID,
	}
}

// WriteError writes the canonical API error payload to the response writer.
func WriteError(c *gin.Context, status int, message string) {
	c.JSON(status, NewErrorResponse(status, message, RequestIDFromContext(c)))
}

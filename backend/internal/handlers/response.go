package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	apiresponse "github.com/omninudge/backend/internal/api/response"
	"github.com/omninudge/backend/internal/services"
)

func requestIDFromContext(c *gin.Context) string {
	if v, ok := c.Get("request_id"); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func errorCodeFromStatus(status int) string {
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
	case http.StatusServiceUnavailable:
		return "service_unavailable"
	default:
		if status >= 500 {
			return "internal_error"
		}
		return "error"
	}
}

// RespondWithError maps a service error (or any error) to the correct HTTP
// status code and writes a JSON error body.
func RespondWithError(c *gin.Context, err error) {
	var svcErr *services.ServiceError
	if errors.As(err, &svcErr) {
		RespondError(c, svcErr.Code, svcErr.Message)
		return
	}
	RespondError(c, http.StatusInternalServerError, "Internal server error")
}

// RespondError writes a JSON error response with the given status code and message.
// This is the direct replacement for c.JSON(code, gin.H{"error": msg}).
func RespondError(c *gin.Context, code int, msg string) {
	resp := apiresponse.ErrorResponse{
		Error:     strings.TrimSpace(msg),
		Code:      errorCodeFromStatus(code),
		Message:   strings.TrimSpace(msg),
		RequestID: requestIDFromContext(c),
	}
	c.JSON(code, resp)
}

// RespondOK writes a 200 JSON response.
func RespondOK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, data)
}

// RespondCreated writes a 201 JSON response.
func RespondCreated(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, data)
}

// RespondNoContent writes a 204 response with no body.
func RespondNoContent(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

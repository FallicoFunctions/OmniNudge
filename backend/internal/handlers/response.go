package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	apiresponse "github.com/omninudge/backend/internal/api/response"
	"github.com/omninudge/backend/internal/helpers"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
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
	case http.StatusPaymentRequired:
		return "payment_required"
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

// RespondErrorCoded attaches a machine-readable reason alongside the status.
// Deriving the code from the status alone collapses distinct failures into one
// opaque response: a single endpoint can return four different 503s, and a
// client that can only see "service_unavailable" cannot tell a broken
// dependency from a misconfiguration. The message stays user-safe; the code is
// what clients and logs branch on.
func RespondErrorCoded(c *gin.Context, status int, reason, msg string) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		RespondError(c, status, msg)
		return
	}
	c.JSON(status, apiresponse.ErrorResponse{
		Error:     strings.TrimSpace(msg),
		Code:      reason,
		Message:   strings.TrimSpace(msg),
		RequestID: requestIDFromContext(c),
	})
}

// hubModeratorRole returns the caller's moderator role for the given hub.
// Site admins always receive a synthetic owner role, bypassing the DB check.
func hubModeratorRole(c *gin.Context, repo *repository.HubSettingsRepository, hubID int, userID int) (*models.ModeratorRole, error) {
	if helpers.IsAdmin(c) {
		owner := models.ModeratorRoleOwner
		return &owner, nil
	}
	return repo.GetModeratorRole(c.Request.Context(), hubID, userID)
}

package middleware

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	apiresponse "github.com/omninudge/backend/internal/api/response"
	"github.com/omninudge/backend/internal/models"
)

// BanEnforcement ensures banned/deleted users are blocked and sets shadow-ban flag
type banStatusProvider interface {
	GetBanStatus(ctx context.Context, userID int) (*models.BanStatus, error)
}

func BanEnforcement(userRepo banStatusProvider) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDVal, exists := c.Get("user_id")
		if !exists {
			apiresponse.WriteError(c, http.StatusUnauthorized, "User not authenticated")
			c.Abort()
			return
		}

		userID, ok := userIDVal.(int)
		if !ok {
			apiresponse.WriteError(c, http.StatusUnauthorized, "Invalid user context")
			c.Abort()
			return
		}

		status, err := userRepo.GetBanStatus(c.Request.Context(), userID)
		if err != nil {
			apiresponse.WriteError(c, http.StatusInternalServerError, "Failed to verify user status")
			c.Abort()
			return
		}
		if status == nil {
			apiresponse.WriteError(c, http.StatusUnauthorized, "User not found")
			c.Abort()
			return
		}

		// Block banned or deleted users
		if status.Banned || status.Deleted {
			message := "Account is banned"
			if status.Deleted {
				message = "Account is deleted"
			}
			resp := gin.H{
				"error":   message,
				"code":    apiresponse.CodeFromStatus(http.StatusUnauthorized),
				"message": message,
			}
			if requestID := apiresponse.RequestIDFromContext(c); requestID != "" {
				resp["request_id"] = requestID
			}
			if status.ShowBanReason && status.BanReason != nil && *status.BanReason != "" {
				resp["reason"] = *status.BanReason
			}
			c.JSON(http.StatusUnauthorized, resp)
			c.Abort()
			return
		}

		// Shadow ban: allow but mark in context for downstream handlers
		if status.ShadowBanned {
			c.Set("shadow_banned", true)
		}

		c.Next()
	}
}

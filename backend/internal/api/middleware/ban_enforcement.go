package middleware

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
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
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
			c.Abort()
			return
		}

		userID, ok := userIDVal.(int)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user context"})
			c.Abort()
			return
		}

		status, err := userRepo.GetBanStatus(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify user status"})
			c.Abort()
			return
		}
		if status == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			c.Abort()
			return
		}

		// Block banned or deleted users
		if status.Banned || status.Deleted {
			resp := gin.H{"error": "Account is banned"}
			if status.Deleted {
				resp["error"] = "Account is deleted"
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

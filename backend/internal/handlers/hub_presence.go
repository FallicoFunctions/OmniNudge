package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
)

type HubPresenceHandler struct {
	presence *services.PresenceStore
}

func NewHubPresenceHandler(presence *services.PresenceStore) *HubPresenceHandler {
	return &HubPresenceHandler{presence: presence}
}

// PingHubPresence handles POST /api/v1/hubs/:name/active-users/ping
func (h *HubPresenceHandler) PingHubPresence(c *gin.Context) {
	hubName := strings.TrimSpace(c.Param("name"))
	if hubName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hub name required"})
		return
	}

	key := h.resolvePresenceKey(c)
	activeUsers := h.presence.Touch(hubName, key)

	c.JSON(http.StatusOK, gin.H{
		"hub":            strings.ToLower(hubName),
		"active_users":   activeUsers,
		"window_seconds": int(h.presence.TTL().Seconds()),
	})
}

// GetHubActiveUsers handles GET /api/v1/hubs/:name/active-users
func (h *HubPresenceHandler) GetHubActiveUsers(c *gin.Context) {
	hubName := strings.TrimSpace(c.Param("name"))
	if hubName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hub name required"})
		return
	}

	key := h.resolvePresenceKey(c)
	activeUsers := h.presence.Touch(hubName, key)

	c.JSON(http.StatusOK, gin.H{
		"hub":            strings.ToLower(hubName),
		"active_users":   activeUsers,
		"window_seconds": int(h.presence.TTL().Seconds()),
	})
}

func (h *HubPresenceHandler) resolvePresenceKey(c *gin.Context) string {
	if userID, exists := c.Get("user_id"); exists {
		return fmt.Sprintf("u:%d", userID.(int))
	}

	return fmt.Sprintf("ip:%s:%s", c.ClientIP(), c.GetHeader("User-Agent"))
}

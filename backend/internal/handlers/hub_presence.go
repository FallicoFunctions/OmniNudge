package handlers

import (
	"github.com/omninudge/backend/internal/api/middleware"
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

// PingHubPresence handles POST /api/v1/hubs/:name/active-users/ping.
// @Summary      Ping hub presence
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Success      200   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Router       /hubs/{name}/active-users/ping [post]
func (h *HubPresenceHandler) PingHubPresence(c *gin.Context) {
	hubName := strings.TrimSpace(c.Param("name"))
	if hubName == "" {
		RespondError(c, http.StatusBadRequest, "Hub name required")
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

// GetHubActiveUsers handles GET /api/v1/hubs/:name/active-users.
// @Summary      Get hub active users
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Success      200   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Router       /hubs/{name}/active-users [get]
func (h *HubPresenceHandler) GetHubActiveUsers(c *gin.Context) {
	hubName := strings.TrimSpace(c.Param("name"))
	if hubName == "" {
		RespondError(c, http.StatusBadRequest, "Hub name required")
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
	if userID, _ := middleware.GetOptionalUserID(c); userID != 0 {
		return fmt.Sprintf("u:%d", userID)
	}

	return fmt.Sprintf("ip:%s:%s", c.ClientIP(), c.GetHeader("User-Agent"))
}

package handlers

import (
	"github.com/omninudge/backend/internal/api/middleware"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
)

type SubredditPresenceHandler struct {
	presence *services.PresenceStore
}

func NewSubredditPresenceHandler(presence *services.PresenceStore) *SubredditPresenceHandler {
	return &SubredditPresenceHandler{presence: presence}
}

// PingSubredditPresence handles POST /api/v1/subreddits/:name/active-users/ping.
// @Summary      Ping subreddit presence
// @Tags         Reddit
// @Produce      json
// @Param        name  path      string  true  "Subreddit name"
// @Success      200   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Router       /subreddits/{name}/active-users/ping [post]
func (h *SubredditPresenceHandler) PingSubredditPresence(c *gin.Context) {
	subreddit := strings.TrimSpace(c.Param("name"))
	if subreddit == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit name required")
		return
	}

	var key string
	if userID, _ := middleware.GetOptionalUserID(c); userID != 0 {
		key = fmt.Sprintf("u:%d", userID)
	} else {
		key = fmt.Sprintf("ip:%s:%s", c.ClientIP(), c.GetHeader("User-Agent"))
	}

	activeUsers := h.presence.Touch(subreddit, key)

	c.JSON(http.StatusOK, gin.H{
		"subreddit":       strings.ToLower(subreddit),
		"active_users":    activeUsers,
		"window_seconds": int(h.presence.TTL().Seconds()),
	})
}

// GetSubredditActiveUsers handles GET /api/v1/subreddits/:name/active-users.
// @Summary      Get subreddit active users
// @Tags         Reddit
// @Produce      json
// @Param        name  path      string  true  "Subreddit name"
// @Success      200   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Router       /subreddits/{name}/active-users [get]
func (h *SubredditPresenceHandler) GetSubredditActiveUsers(c *gin.Context) {
	subreddit := strings.TrimSpace(c.Param("name"))
	if subreddit == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit name required")
		return
	}

	activeUsers := 0
	if userID, _ := middleware.GetOptionalUserID(c); userID != 0 {
		activeUsers = h.presence.Touch(subreddit, fmt.Sprintf("u:%d", userID))
	} else {
		activeUsers = h.presence.Touch(subreddit, fmt.Sprintf("ip:%s:%s", c.ClientIP(), c.GetHeader("User-Agent")))
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddit":       strings.ToLower(subreddit),
		"active_users":    activeUsers,
		"window_seconds": int(h.presence.TTL().Seconds()),
	})
}

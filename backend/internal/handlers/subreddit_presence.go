package handlers

import (
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

// PingSubredditPresence handles POST /api/v1/subreddits/:name/active-users/ping
func (h *SubredditPresenceHandler) PingSubredditPresence(c *gin.Context) {
	subreddit := strings.TrimSpace(c.Param("name"))
	if subreddit == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit name required"})
		return
	}

	var key string
	if userID, exists := c.Get("user_id"); exists {
		key = fmt.Sprintf("u:%d", userID.(int))
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

// GetSubredditActiveUsers handles GET /api/v1/subreddits/:name/active-users
func (h *SubredditPresenceHandler) GetSubredditActiveUsers(c *gin.Context) {
	subreddit := strings.TrimSpace(c.Param("name"))
	if subreddit == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit name required"})
		return
	}

	activeUsers := 0
	if userID, exists := c.Get("user_id"); exists {
		activeUsers = h.presence.Touch(subreddit, fmt.Sprintf("u:%d", userID.(int)))
	} else {
		activeUsers = h.presence.Touch(subreddit, fmt.Sprintf("ip:%s:%s", c.ClientIP(), c.GetHeader("User-Agent")))
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddit":       strings.ToLower(subreddit),
		"active_users":    activeUsers,
		"window_seconds": int(h.presence.TTL().Seconds()),
	})
}

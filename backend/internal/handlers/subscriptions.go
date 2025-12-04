package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
)

// SubscriptionsHandler handles subscription operations
type SubscriptionsHandler struct {
	hubSubRepo       *models.HubSubscriptionRepository
	subredditSubRepo *models.SubredditSubscriptionRepository
	hubRepo          *models.HubRepository
}

// NewSubscriptionsHandler creates a new subscriptions handler
func NewSubscriptionsHandler(
	hubSubRepo *models.HubSubscriptionRepository,
	subredditSubRepo *models.SubredditSubscriptionRepository,
	hubRepo *models.HubRepository,
) *SubscriptionsHandler {
	return &SubscriptionsHandler{
		hubSubRepo:       hubSubRepo,
		subredditSubRepo: subredditSubRepo,
		hubRepo:          hubRepo,
	}
}

// SubscribeToHub handles POST /api/v1/hubs/:name/subscribe
func (h *SubscriptionsHandler) SubscribeToHub(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	err = h.hubSubRepo.Subscribe(c.Request.Context(), userID.(int), hub.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to subscribe", "details": err.Error()})
		return
	}

	// Fetch updated hub to get new subscriber count
	updatedHub, _ := h.hubRepo.GetByName(c.Request.Context(), hubName)
	subscriberCount := 0
	if updatedHub != nil {
		subscriberCount = updatedHub.SubscriberCount
	}

	c.JSON(http.StatusOK, gin.H{
		"message":          "Successfully subscribed",
		"subscribed":       true,
		"subscriber_count": subscriberCount,
	})
}

// UnsubscribeFromHub handles DELETE /api/v1/hubs/:name/unsubscribe
func (h *SubscriptionsHandler) UnsubscribeFromHub(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	err = h.hubSubRepo.Unsubscribe(c.Request.Context(), userID.(int), hub.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unsubscribe", "details": err.Error()})
		return
	}

	// Fetch updated hub to get new subscriber count
	updatedHub, _ := h.hubRepo.GetByName(c.Request.Context(), hubName)
	subscriberCount := 0
	if updatedHub != nil {
		subscriberCount = updatedHub.SubscriberCount
	}

	c.JSON(http.StatusOK, gin.H{
		"message":          "Successfully unsubscribed",
		"subscribed":       false,
		"subscriber_count": subscriberCount,
	})
}

// CheckHubSubscription handles GET /api/v1/hubs/:name/subscription
// Optional auth - returns subscription status if authenticated, otherwise returns public info
func (h *SubscriptionsHandler) CheckHubSubscription(c *gin.Context) {
	hubName := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	// Check if user is authenticated
	userID, authenticated := c.Get("user_id")

	if authenticated {
		// Check subscription status
		isSubscribed, err := h.hubSubRepo.IsSubscribed(c.Request.Context(), userID.(int), hub.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check subscription", "details": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"subscribed":       isSubscribed,
			"subscriber_count": hub.SubscriberCount,
		})
	} else {
		// Just return public info
		c.JSON(http.StatusOK, gin.H{
			"subscribed":       false,
			"subscriber_count": hub.SubscriberCount,
		})
	}
}

// GetUserHubSubscriptions handles GET /api/v1/users/me/subscriptions/hubs
func (h *SubscriptionsHandler) GetUserHubSubscriptions(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	subscriptions, err := h.hubSubRepo.GetUserSubscriptions(c.Request.Context(), userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subscriptions", "details": err.Error()})
		return
	}

	// Fetch hub details for each subscription
	type SubscriptionWithHub struct {
		ID           int          `json:"id"`
		UserID       int          `json:"user_id"`
		HubID        int          `json:"hub_id"`
		Hub          *models.Hub  `json:"hub"`
		SubscribedAt string       `json:"subscribed_at"`
	}

	var result []SubscriptionWithHub
	for _, sub := range subscriptions {
		hub, _ := h.hubRepo.GetByID(c.Request.Context(), sub.HubID)
		result = append(result, SubscriptionWithHub{
			ID:           sub.ID,
			UserID:       sub.UserID,
			HubID:        sub.HubID,
			Hub:          hub,
			SubscribedAt: sub.SubscribedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"subscriptions": result,
		"count":         len(result),
	})
}

// SubscribeToSubreddit handles POST /api/v1/subreddits/:name/subscribe
func (h *SubscriptionsHandler) SubscribeToSubreddit(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	subredditName := c.Param("name")
	if subredditName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit name is required"})
		return
	}

	err := h.subredditSubRepo.Subscribe(c.Request.Context(), userID.(int), subredditName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to subscribe", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Successfully subscribed",
		"subscribed": true,
		"subreddit":  subredditName,
	})
}

// UnsubscribeFromSubreddit handles DELETE /api/v1/subreddits/:name/unsubscribe
func (h *SubscriptionsHandler) UnsubscribeFromSubreddit(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	subredditName := c.Param("name")
	if subredditName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit name is required"})
		return
	}

	err := h.subredditSubRepo.Unsubscribe(c.Request.Context(), userID.(int), subredditName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unsubscribe", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Successfully unsubscribed",
		"subscribed": false,
		"subreddit":  subredditName,
	})
}

// CheckSubredditSubscription handles GET /api/v1/subreddits/:name/subscription
func (h *SubscriptionsHandler) CheckSubredditSubscription(c *gin.Context) {
	subredditName := c.Param("name")
	if subredditName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit name is required"})
		return
	}

	// Check if user is authenticated
	userID, authenticated := c.Get("user_id")

	if authenticated {
		isSubscribed, err := h.subredditSubRepo.IsSubscribed(c.Request.Context(), userID.(int), subredditName)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check subscription", "details": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"subscribed": isSubscribed,
			"subreddit":  subredditName,
		})
	} else {
		c.JSON(http.StatusOK, gin.H{
			"subscribed": false,
			"subreddit":  subredditName,
		})
	}
}

// GetUserSubredditSubscriptions handles GET /api/v1/users/me/subscriptions/subreddits
func (h *SubscriptionsHandler) GetUserSubredditSubscriptions(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	subscriptions, err := h.subredditSubRepo.GetUserSubscriptions(c.Request.Context(), userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subscriptions", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"subscriptions": subscriptions,
		"count":         len(subscriptions),
	})
}

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
		"is_subscribed":    true,
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
		"is_subscribed":    false,
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
			"is_subscribed":    isSubscribed,
			"subscriber_count": hub.SubscriberCount,
		})
	} else {
		// Just return public info
		c.JSON(http.StatusOK, gin.H{
			"is_subscribed":    false,
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

	// Fetch hub details for each subscription concurrently
	type SubscriptionWithHub struct {
		ID           int         `json:"id"`
		UserID       int         `json:"user_id"`
		HubID        int         `json:"hub_id"`
		Hub          *models.Hub `json:"hub"`
		SubscribedAt string      `json:"subscribed_at"`
	}

	// Ensure subscriptions is never nil
	if subscriptions == nil {
		c.JSON(http.StatusOK, gin.H{
			"subscriptions": []SubscriptionWithHub{},
			"count":         0,
		})
		return
	}

	result := make([]SubscriptionWithHub, len(subscriptions))
	ctx := c.Request.Context()

	type hubResult struct {
		index int
		hub   *models.Hub
	}

	resultsChan := make(chan hubResult, len(subscriptions))

	// Fetch hub details concurrently for better performance
	for i, sub := range subscriptions {
		go func(idx int, subscription *models.HubSubscription) {
			hub, _ := h.hubRepo.GetByID(ctx, subscription.HubID)
			resultsChan <- hubResult{index: idx, hub: hub}
		}(i, sub)
	}

	// Collect results
	for i := 0; i < len(subscriptions); i++ {
		res := <-resultsChan
		result[res.index] = SubscriptionWithHub{
			ID:           subscriptions[res.index].ID,
			UserID:       subscriptions[res.index].UserID,
			HubID:        subscriptions[res.index].HubID,
			Hub:          res.hub,
			SubscribedAt: subscriptions[res.index].SubscribedAt.Format("2006-01-02T15:04:05Z07:00"),
		}
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
		"message":       "Successfully subscribed",
		"is_subscribed": true,
		"subreddit":     subredditName,
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
		"message":       "Successfully unsubscribed",
		"is_subscribed": false,
		"subreddit":     subredditName,
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

	response := gin.H{
		"subreddit":     subredditName,
		"is_subscribed": false,
		"subscribed":    false,
	}

	if authenticated {
		isSubscribed, err := h.subredditSubRepo.IsSubscribed(c.Request.Context(), userID.(int), subredditName)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check subscription", "details": err.Error()})
			return
		}

		response["is_subscribed"] = isSubscribed
		response["subscribed"] = isSubscribed
	}

	c.JSON(http.StatusOK, response)
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

	// Ensure subscriptions is never nil (convert nil to empty slice for JSON)
	if subscriptions == nil {
		subscriptions = make([]*models.SubredditSubscription, 0)
	}

	c.JSON(http.StatusOK, gin.H{
		"subscriptions": subscriptions,
		"count":         len(subscriptions),
	})
}

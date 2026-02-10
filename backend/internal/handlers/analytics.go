package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
)

type AnalyticsHandler struct {
	svc *services.AnalyticsService
}

func NewAnalyticsHandler(svc *services.AnalyticsService) *AnalyticsHandler {
	return &AnalyticsHandler{svc: svc}
}

// TrackEvent records an analytics event
// POST /api/v1/analytics/track
func (h *AnalyticsHandler) TrackEvent(c *gin.Context) {
	userID := c.GetInt("user_id") // May be 0 if not authenticated

	var req struct {
		Event      string                 `json:"event" binding:"required"`
		Properties map[string]interface{} `json:"properties"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	event := services.Event{
		Name:       req.Event,
		Properties: req.Properties,
		UserAgent:  c.Request.UserAgent(),
		IPAddress:  c.ClientIP(),
	}

	if userID > 0 {
		event.UserID = &userID
	}

	if err := h.svc.TrackEvent(c.Request.Context(), event); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to track event"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "tracked"})
}

// GetDashboard returns analytics dashboard data (admin only)
// GET /api/v1/admin/analytics/dashboard
func (h *AnalyticsHandler) GetDashboard(c *gin.Context) {
	// This would aggregate various metrics
	// For now, return placeholder
	c.JSON(http.StatusOK, gin.H{
		"message": "Analytics dashboard - integrate with your chosen analytics tool",
	})
}

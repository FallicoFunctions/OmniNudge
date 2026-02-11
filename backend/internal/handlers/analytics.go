package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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
		Event       string                 `json:"event" binding:"required"`
		AnonymousID string                 `json:"anonymous_id"`
		SessionID   string                 `json:"session_id"`
		Properties  map[string]interface{} `json:"properties"`
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

	if req.AnonymousID != "" {
		if uid, err := uuid.Parse(req.AnonymousID); err == nil {
			event.AnonymousID = &uid
		}
	}

	if req.SessionID != "" {
		if sid, err := uuid.Parse(req.SessionID); err == nil {
			event.SessionID = &sid
		}
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

// StartSession creates a new session
// POST /api/v1/analytics/session/start
func (h *AnalyticsHandler) StartSession(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		SessionID   string `json:"session_id" binding:"required"`
		AnonymousID string `json:"anonymous_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	anonymousID, err := uuid.Parse(req.AnonymousID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid anonymous ID"})
		return
	}

	var uidPtr *int
	if userID > 0 {
		uidPtr = &userID
	}

	if err := h.svc.StartSession(c.Request.Context(), sessionID, anonymousID, uidPtr, c.Request.UserAgent(), c.ClientIP()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "started"})
}

// EndSession ends a session
// POST /api/v1/analytics/session/end
func (h *AnalyticsHandler) EndSession(c *gin.Context) {
	var req struct {
		SessionID string `json:"session_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	if err := h.svc.EndSession(c.Request.Context(), sessionID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to end session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ended"})
}

// Identify links an anonymous ID to a logged-in user
// POST /api/v1/analytics/identify
func (h *AnalyticsHandler) Identify(c *gin.Context) {
	userID := c.GetInt("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}

	var req struct {
		AnonymousID string `json:"anonymous_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	anonymousID, err := uuid.Parse(req.AnonymousID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid anonymous ID"})
		return
	}

	if err := h.svc.AliasUser(c.Request.Context(), userID, anonymousID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to alias user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "identified"})
}

// GetDashboard returns analytics dashboard data (admin only)
// GET /api/v1/admin/analytics/dashboard
func (h *AnalyticsHandler) GetDashboard(c *gin.Context) {
	days := 30
	dau, err := h.svc.GetDailyActiveUsers(c.Request.Context(), days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get DAU"})
		return
	}

	topEvents, err := h.svc.GetTopEvents(c.Request.Context(), 10)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get top events"})
		return
	}

	// Simple recent events query to populate the "stream"
	// For production, this should be paginated or streamed via WebSocket
	recentEvents := make([]services.Event, 0) // Placeholder for now or implement GetRecentEvents in service

	c.JSON(http.StatusOK, gin.H{
		"dau":           dau,
		"top_events":    topEvents,
		"recent_events": recentEvents,
		"last_updated":  time.Now(),
	})
}

// RefreshAnalytics manually refreshes materialized views (admin only)
// POST /api/v1/admin/analytics/refresh
func (h *AnalyticsHandler) RefreshAnalytics(c *gin.Context) {
	if err := h.svc.RefreshMaterializedViews(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to refresh views"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "refreshed"})
}

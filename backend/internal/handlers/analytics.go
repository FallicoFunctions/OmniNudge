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

// TrackEvent records an analytics event.
// @Summary      Track analytics event
// @Tags         Analytics
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /analytics/track [post]
func (h *AnalyticsHandler) TrackEvent(c *gin.Context) {
	userID := c.GetInt("user_id") // May be 0 if not authenticated

	var req struct {
		Event       string                 `json:"event" binding:"required"`
		AnonymousID string                 `json:"anonymous_id"`
		SessionID   string                 `json:"session_id"`
		Properties  map[string]interface{} `json:"properties"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
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
		RespondError(c, http.StatusInternalServerError, "Failed to track event")
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "tracked"})
}

// StartSession creates a new analytics session.
// @Summary      Start analytics session
// @Tags         Analytics
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /analytics/session/start [post]
func (h *AnalyticsHandler) StartSession(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		SessionID   string `json:"session_id" binding:"required"`
		AnonymousID string `json:"anonymous_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid session ID")
		return
	}

	anonymousID, err := uuid.Parse(req.AnonymousID)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid anonymous ID")
		return
	}

	var uidPtr *int
	if userID > 0 {
		uidPtr = &userID
	}

	if err := h.svc.StartSession(c.Request.Context(), sessionID, anonymousID, uidPtr, c.Request.UserAgent(), c.ClientIP()); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to start session")
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "started"})
}

// EndSession ends an analytics session.
// @Summary      End analytics session
// @Tags         Analytics
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /analytics/session/end [post]
func (h *AnalyticsHandler) EndSession(c *gin.Context) {
	var req struct {
		SessionID string `json:"session_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid session ID")
		return
	}

	if err := h.svc.EndSession(c.Request.Context(), sessionID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to end session")
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ended"})
}

// Identify links an anonymous ID to a logged-in user.
// @Summary      Identify analytics user
// @Tags         Analytics
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /analytics/identify [post]
func (h *AnalyticsHandler) Identify(c *gin.Context) {
	userID := c.GetInt("user_id")
	if userID == 0 {
		RespondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req struct {
		AnonymousID string `json:"anonymous_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	anonymousID, err := uuid.Parse(req.AnonymousID)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid anonymous ID")
		return
	}

	if err := h.svc.AliasUser(c.Request.Context(), userID, anonymousID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to alias user")
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "identified"})
}

// GetDashboard returns analytics dashboard data.
// @Summary      Get analytics dashboard
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/analytics/dashboard [get]
func (h *AnalyticsHandler) GetDashboard(c *gin.Context) {
	days := 30
	dau, err := h.svc.GetDailyActiveUsers(c.Request.Context(), days)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get DAU")
		return
	}

	topEvents, err := h.svc.GetTopEvents(c.Request.Context(), 10)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get top events")
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

// RefreshAnalytics manually refreshes analytics materialized views.
// @Summary      Refresh analytics views
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/analytics/refresh [post]
func (h *AnalyticsHandler) RefreshAnalytics(c *gin.Context) {
	if err := h.svc.RefreshMaterializedViews(c.Request.Context()); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to refresh views")
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "refreshed"})
}

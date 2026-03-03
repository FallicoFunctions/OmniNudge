package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
)

type AnalyticsEnhancedHandler struct {
	svc *services.AnalyticsServiceEnhanced
}

func NewAnalyticsEnhancedHandler(svc *services.AnalyticsServiceEnhanced) *AnalyticsEnhancedHandler {
	return &AnalyticsEnhancedHandler{svc: svc}
}

// TrackEvent records an analytics event (called by frontend)
// POST /api/v1/analytics/track
func (h *AnalyticsEnhancedHandler) TrackEvent(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		Event      string                 `json:"event" binding:"required"`
		Properties map[string]interface{} `json:"properties"`
		SessionID  string                 `json:"session_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	event := &services.Event{
		Name:       req.Event,
		Properties: req.Properties,
		UserAgent:  c.Request.UserAgent(),
		IPAddress:  c.ClientIP(),
	}

	if userID > 0 {
		event.UserID = &userID
	}

	// Enrich event
	enriched := h.svc.EnrichEvent(c.Request.Context(), event, c.Request.UserAgent(), c.Request.Referer())

	// Track asynchronously
	if err := h.svc.TrackEventAsync(c.Request.Context(), enriched); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to track event")
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "tracked"})
}

// GetDashboard returns comprehensive analytics dashboard data (admin only)
// GET /api/v1/admin/analytics/dashboard
func (h *AnalyticsEnhancedHandler) GetDashboard(c *gin.Context) {
	ctx := c.Request.Context()

	// Get time range from query params (default: last 7 days)
	daysParam := c.DefaultQuery("days", "7")
	days, err := strconv.Atoi(daysParam)
	if err != nil || days < 1 {
		days = 7
	}

	since := time.Now().AddDate(0, 0, -days)

	// Fetch all dashboard metrics in parallel
	type dauResult struct {
		value int64
		err   error
	}
	type mauResult struct {
		value int64
		err   error
	}
	type eventsResult struct {
		value []services.EventStat
		err   error
	}
	type countResult struct {
		value int64
	}

	dauChan := make(chan dauResult, 1)
	mauChan := make(chan mauResult, 1)
	eventsChan := make(chan eventsResult, 1)
	countChan := make(chan countResult, 1)

	// Run all queries in parallel
	go func() {
		dau, err := h.svc.GetActiveUserCount(ctx, 1)
		dauChan <- dauResult{value: dau, err: err}
	}()

	go func() {
		mau, err := h.svc.GetActiveUserCount(ctx, 30)
		mauChan <- mauResult{value: mau, err: err}
	}()

	go func() {
		events, err := h.svc.GetTopEvents(ctx, since, 10)
		eventsChan <- eventsResult{value: events, err: err}
	}()

	go func() {
		count := h.getTotalEventCount(ctx, since)
		countChan <- countResult{value: count}
	}()

	// Collect results with timeout
	var dau, mau, eventCount int64
	var topEvents []services.EventStat

	timeout := time.After(10 * time.Second)

	for i := 0; i < 4; i++ {
		select {
		case r := <-dauChan:
			if r.err == nil {
				dau = r.value
			}
		case r := <-mauChan:
			if r.err == nil {
				mau = r.value
			}
		case r := <-eventsChan:
			if r.err == nil {
				topEvents = r.value
			}
		case r := <-countChan:
			eventCount = r.value
		case <-timeout:
			RespondError(c, http.StatusGatewayTimeout, "Dashboard generation timeout")
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"period_days":  days,
		"dau":          dau,
		"mau":          mau,
		"total_events": eventCount,
		"top_events":   topEvents,
		"generated_at": time.Now().Format(time.RFC3339),
	})
}

// GetEventStats returns stats for a specific event
// GET /api/v1/admin/analytics/events/:event_name
func (h *AnalyticsEnhancedHandler) GetEventStats(c *gin.Context) {
	eventName := c.Param("event_name")
	if eventName == "" {
		RespondError(c, http.StatusBadRequest, "event_name required")
		return
	}

	daysParam := c.DefaultQuery("days", "7")
	days, err := strconv.Atoi(daysParam)
	if err != nil || days < 1 {
		days = 7
	}

	since := time.Now().AddDate(0, 0, -days)

	count, err := h.svc.GetEventStats(c.Request.Context(), eventName, since)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch stats")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"event_name": eventName,
		"count":      count,
		"since":      since.Format(time.RFC3339),
	})
}

// GetUserCohort returns retention data for a signup cohort
// GET /api/v1/admin/analytics/cohort
func (h *AnalyticsEnhancedHandler) GetUserCohort(c *gin.Context) {
	dateParam := c.Query("signup_date")
	if dateParam == "" {
		RespondError(c, http.StatusBadRequest, "signup_date required (YYYY-MM-DD)")
		return
	}

	signupDate, err := time.Parse("2006-01-02", dateParam)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid date format (use YYYY-MM-DD)")
		return
	}

	daysAfterParam := c.DefaultQuery("days_after", "7")
	daysAfter, err := strconv.Atoi(daysAfterParam)
	if err != nil || daysAfter < 1 {
		daysAfter = 7
	}

	retention, err := h.svc.GetUserCohort(c.Request.Context(), signupDate, daysAfter)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch cohort data")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"signup_date":      dateParam,
		"days_after":       daysAfter,
		"retention_rate":   retention,
		"retention_percent": fmt.Sprintf("%.1f%%", retention),
	})
}

// GetFunnelAnalysis returns conversion funnel data
// GET /api/v1/admin/analytics/funnel
func (h *AnalyticsEnhancedHandler) GetFunnelAnalysis(c *gin.Context) {
	startEvent := c.Query("start_event")
	endEvent := c.Query("end_event")

	if startEvent == "" || endEvent == "" {
		RespondError(c, http.StatusBadRequest, "start_event and end_event required")
		return
	}

	windowDaysParam := c.DefaultQuery("window_days", "7")
	windowDays, err := strconv.Atoi(windowDaysParam)
	if err != nil || windowDays < 1 {
		windowDays = 7
	}

	conversion, err := h.svc.GetFunnelConversion(c.Request.Context(), startEvent, endEvent, windowDays)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch funnel data")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"start_event":        startEvent,
		"end_event":          endEvent,
		"window_days":        windowDays,
		"conversion_rate":    conversion,
		"conversion_percent": fmt.Sprintf("%.1f%%", conversion),
	})
}

// GetDeviceBreakdown returns device/browser/OS statistics
// GET /api/v1/admin/analytics/devices?days=7&limit=10
func (h *AnalyticsEnhancedHandler) GetDeviceBreakdown(c *gin.Context) {
	daysParam := c.DefaultQuery("days", "7")
	days, err := strconv.Atoi(daysParam)
	if err != nil || days < 1 {
		days = 7
	}

	limitParam := c.DefaultQuery("limit", "10")
	limit, err := strconv.Atoi(limitParam)
	if err != nil || limit < 1 || limit > 100 {
		limit = 10
	}

	ctx := c.Request.Context()
	since := time.Now().AddDate(0, 0, -days)

	devices := h.getBreakdownByField(ctx, "device_type", since, limit)
	browsers := h.getBreakdownByField(ctx, "browser", since, limit)
	oses := h.getBreakdownByField(ctx, "os", since, limit)

	c.JSON(http.StatusOK, gin.H{
		"devices":  devices,
		"browsers": browsers,
		"os":       oses,
		"since":    since.Format(time.RFC3339),
		"limit":    limit,
	})
}

// GetGeographicBreakdown returns country/city statistics
// GET /api/v1/admin/analytics/geo?days=7&limit=10
func (h *AnalyticsEnhancedHandler) GetGeographicBreakdown(c *gin.Context) {
	daysParam := c.DefaultQuery("days", "7")
	days, err := strconv.Atoi(daysParam)
	if err != nil || days < 1 {
		days = 7
	}

	limitParam := c.DefaultQuery("limit", "10")
	limit, err := strconv.Atoi(limitParam)
	if err != nil || limit < 1 || limit > 100 {
		limit = 10
	}

	ctx := c.Request.Context()
	since := time.Now().AddDate(0, 0, -days)

	countries := h.getBreakdownByField(ctx, "country", since, limit)
	cities := h.getBreakdownByField(ctx, "city", since, limit)

	c.JSON(http.StatusOK, gin.H{
		"countries": countries,
		"cities":    cities,
		"since":     since.Format(time.RFC3339),
		"limit":     limit,
	})
}

// Helper functions

func (h *AnalyticsEnhancedHandler) getTotalEventCount(ctx context.Context, since time.Time) int64 {
	var count int64
	err := h.svc.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM analytics_events WHERE created_at >= $1
	`, since).Scan(&count)

	if err != nil {
		return 0
	}
	return count
}

func (h *AnalyticsEnhancedHandler) getBreakdownByField(ctx context.Context, field string, since time.Time, limit int) []map[string]interface{} {
	// Whitelist allowed fields to prevent SQL injection
	allowedFields := map[string]bool{
		"device_type": true,
		"browser":     true,
		"os":          true,
		"country":     true,
		"city":        true,
	}

	if !allowedFields[field] {
		return []map[string]interface{}{}
	}

	// Limit between 1 and 100
	if limit < 1 || limit > 100 {
		limit = 10
	}

	query := fmt.Sprintf(`
		SELECT %s, COUNT(*) as count
		FROM analytics_events
		WHERE created_at >= $1 AND %s IS NOT NULL AND %s != ''
		GROUP BY %s
		ORDER BY count DESC
		LIMIT $2
	`, field, field, field, field)

	rows, err := h.svc.DB.Query(ctx, query, since, limit)
	if err != nil {
		return []map[string]interface{}{}
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var name string
		var count int64
		if err := rows.Scan(&name, &count); err != nil {
			continue
		}

		results = append(results, map[string]interface{}{
			"name":  name,
			"count": count,
		})
	}

	return results
}

// RefreshMaterializedViews manually refreshes analytics views (admin only)
// POST /api/v1/admin/analytics/refresh
func (h *AnalyticsEnhancedHandler) RefreshMaterializedViews(c *gin.Context) {
	ctx := c.Request.Context()

	_, err := h.svc.DB.Exec(ctx, "SELECT refresh_analytics_views()")
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to refresh views")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":      "success",
		"refreshed_at": time.Now().Format(time.RFC3339),
	})
}

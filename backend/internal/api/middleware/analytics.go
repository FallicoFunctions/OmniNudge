package middleware

import (
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	apiresponse "github.com/omninudge/backend/internal/api/response"
	"github.com/omninudge/backend/internal/services"
)

// AnalyticsMiddleware automatically tracks page views and API usage
func AnalyticsMiddleware(analyticsService *services.AnalyticsServiceEnhanced) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip OPTIONS requests (CORS preflight)
		if c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		// Skip tracking for certain paths
		if shouldSkipTracking(c.Request.URL.Path) {
			c.Next()
			return
		}

		// Get user ID if authenticated
		userID := c.GetInt("user_id")
		var userIDPtr *int
		if userID > 0 {
			userIDPtr = &userID
		}

		// Get or create session ID from cookie
		sessionID := getOrCreateSessionID(c)

		// Get request metadata
		userAgent := c.Request.UserAgent()
		referrer := c.Request.Referer()

		// Track different event types based on path
		eventName := determineEventName(c.Request.Method, c.Request.URL.Path)

		// Create event
		event := &services.Event{
			Name:       eventName,
			UserID:     userIDPtr,
			UserAgent:  userAgent,
			IPAddress:  c.ClientIP(),
			Properties: make(map[string]interface{}),
		}

		// Add path and method to properties
		event.Properties["path"] = c.Request.URL.Path
		event.Properties["method"] = c.Request.Method

		// Add query parameters (for search, filtering)
		if len(c.Request.URL.Query()) > 0 {
			event.Properties["query_params"] = c.Request.URL.Query().Encode()
		}

		// Enrich event
		enrichedEvent := analyticsService.EnrichEvent(c.Request.Context(), event, userAgent, referrer)
		enrichedEvent.SessionID = &sessionID

		// Track the request start time
		start := time.Now()

		// Process request
		c.Next()

		// Add response metadata
		enrichedEvent.Properties["status_code"] = c.Writer.Status()
		enrichedEvent.Properties["duration_ms"] = time.Since(start).Milliseconds()

		// Track asynchronously (non-blocking)
		go func() {
			if err := analyticsService.TrackEventAsync(c.Request.Context(), enrichedEvent); err != nil {
				// Log but don't fail the request
				fmt.Printf("[Analytics] Failed to track event: %v\n", err)
			}
		}()
	}
}

// shouldSkipTracking returns true for paths that shouldn't be tracked
func shouldSkipTracking(path string) bool {
	skipPaths := []string{
		"/metrics",           // Prometheus
		"/health",            // Health checks
		"/health/liveness",   // K8s probes
		"/health/readiness",  // K8s probes
		"/api/v1/analytics/", // Don't track analytics endpoints themselves
		"/favicon.ico",       // Browser requests
		"/robots.txt",        // Crawlers
	}

	for _, skipPath := range skipPaths {
		if strings.HasPrefix(path, skipPath) {
			return true
		}
	}

	return false
}

// determineEventName maps API paths to event names
func determineEventName(method, path string) string {
	// Map common patterns to semantic event names
	patterns := map[string]string{
		"/api/v1/posts":       services.EventPostViewed,
		"/api/v1/hubs":        services.EventHubViewed,
		"/api/v1/messages":    "api_messages_accessed",
		"/api/v1/search":      services.EventSearchPerformed,
		"/api/v1/users/me":    "profile_viewed",
		"/api/v1/settings":    "settings_accessed",
		"/api/v1/auth/login":  services.EventLogin,
		"/api/v1/auth/signup": services.EventSignup,
		"/api/v1/auth/logout": services.EventLogout,
	}

	// Check for exact matches first
	if eventName, ok := patterns[path]; ok {
		return eventName
	}

	// Check for prefix matches
	for pattern, eventName := range patterns {
		if strings.HasPrefix(path, pattern) {
			return eventName
		}
	}

	// Default: generic API call event
	if method == "GET" {
		return "api_request_get"
	}
	return "api_request_" + strings.ToLower(method)
}

// getOrCreateSessionID gets session ID from cookie or creates new one
func getOrCreateSessionID(c *gin.Context) uuid.UUID {
	// Try to get existing session ID from cookie
	sessionIDStr, err := c.Cookie("session_id")
	if err == nil && sessionIDStr != "" {
		if sessionID, err := uuid.Parse(sessionIDStr); err == nil {
			return sessionID
		}
	}

	// Create new session ID
	sessionID := uuid.New()

	// Determine if HTTPS is being used
	isSecure := c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https"

	// Set cookie (30 minute session)
	c.SetCookie(
		"session_id",       // name
		sessionID.String(), // value
		1800,               // maxAge (30 minutes)
		"/",                // path
		"",                 // domain
		isSecure,           // secure (true if HTTPS)
		true,               // httpOnly
	)

	return sessionID
}

// PageViewTracker tracks frontend page views (called by frontend)
func PageViewTracker(analyticsService *services.AnalyticsServiceEnhanced) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Page     string                 `json:"page" binding:"required"`
			Title    string                 `json:"title"`
			Referrer string                 `json:"referrer"`
			Props    map[string]interface{} `json:"properties"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			apiresponse.WriteError(c, 400, "Invalid request")
			return
		}

		userID := c.GetInt("user_id")
		var userIDPtr *int
		if userID > 0 {
			userIDPtr = &userID
		}

		sessionID := getOrCreateSessionID(c)

		event := &services.Event{
			Name:       "page_view",
			UserID:     userIDPtr,
			UserAgent:  c.Request.UserAgent(),
			IPAddress:  c.ClientIP(),
			Properties: req.Props,
		}

		if event.Properties == nil {
			event.Properties = make(map[string]interface{})
		}

		event.Properties["page"] = req.Page
		event.Properties["title"] = req.Title
		event.Properties["referrer"] = req.Referrer

		enriched := analyticsService.EnrichEvent(c.Request.Context(), event, c.Request.UserAgent(), req.Referrer)
		enriched.SessionID = &sessionID

		if err := analyticsService.TrackEventAsync(c.Request.Context(), enriched); err != nil {
			apiresponse.WriteError(c, 500, "Failed to track page view")
			return
		}

		c.JSON(200, gin.H{"status": "tracked"})
	}
}

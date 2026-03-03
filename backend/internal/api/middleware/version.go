package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	apiresponse "github.com/omninudge/backend/internal/api/response"
)

// APIVersion middleware adds API version information to responses
// and extracts version from request path
func APIVersion() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Extract version from path (/api/v1/... or /api/v2/...)
		path := c.Request.URL.Path
		version := "1" // Default to v1

		if strings.HasPrefix(path, "/api/v1") {
			version = "1"
		} else if strings.HasPrefix(path, "/api/v2") {
			version = "2"
		}

		// Store in context for handlers
		c.Set("api_version", version)

		// Add version headers to response
		c.Header("X-API-Version", version)
		c.Header("X-API-Latest-Version", "1") // Update when v2 is released

		c.Next()
	}
}

// DeprecationWarning middleware adds deprecation headers to responses
// Use this to warn clients that a version will be sunset
func DeprecationWarning(sunsetDate string, successorURL string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Add deprecation headers
		c.Header("X-API-Deprecated", "true")
		c.Header("X-API-Sunset-Date", sunsetDate) // Format: 2026-08-06
		c.Header("Deprecation", "true")           // Standard deprecation header
		if sunset := formatSunsetHeader(sunsetDate); sunset != "" {
			c.Header("Sunset", sunset)
		}

		// Add Link header pointing to new version
		if successorURL != "" {
			c.Header("Link", "<"+successorURL+">; rel=\"successor-version\"")
		}

		c.Next()

		// Add deprecation notice to JSON responses (if applicable)
		if c.Writer.Header().Get("Content-Type") == "application/json" {
			// Note: This modifies the response, so use with caution
			// Alternatively, document that clients should check headers
		}
	}
}

// SunsetVersion middleware returns 410 Gone for versions that have been sunset
// Use this after deprecation period ends
func SunsetVersion() gin.HandlerFunc {
	return func(c *gin.Context) {
		msg := "This API version is no longer supported. Please upgrade to the latest version."
		resp := gin.H{
			"error":           msg,
			"code":            "version_sunset",
			"message":         msg,
			"latest_version":  "v2",
			"migration_guide": "https://docs.omninudge.com/api/v1-to-v2-migration",
		}
		if requestID := apiresponse.RequestIDFromContext(c); requestID != "" {
			resp["request_id"] = requestID
		}
		c.JSON(http.StatusGone, resp)
		c.Abort()
	}
}

func formatSunsetHeader(sunsetDate string) string {
	// Prefer strict YYYY-MM-DD input; otherwise pass through non-empty values.
	if t, err := time.Parse("2006-01-02", sunsetDate); err == nil {
		return t.UTC().Format("Mon, 02 Jan 2006 15:04:05 GMT")
	}
	return strings.TrimSpace(sunsetDate)
}

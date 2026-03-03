package middleware

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/pkg/logger"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// healthPaths are never logged — they are high-frequency probes that would
// drown out meaningful signal.
var healthPaths = map[string]struct{}{
	"/health":           {},
	"/ready":            {},
	"/live":             {},
	"/health/liveness":  {},
	"/health/readiness": {},
}

// StructuredLogger logs each request as a single JSON line using zerolog.
//
// Log level selection:
//   - 5xx → Error
//   - 4xx → Warn
//   - 2xx / 3xx → Info
//
// PII rules:
//   - The Authorization header value is never logged.
//   - The "password" query parameter is never logged.
//   - User-supplied strings (path, user-agent) are sanitized to prevent log
//     injection via embedded newlines or control characters.
func StructuredLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path

		// Skip health/readiness probes entirely.
		if _, skip := healthPaths[path]; skip {
			c.Next()
			return
		}

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		var ev *zerolog.Event
		switch {
		case status >= 500:
			ev = log.Error()
		case status >= 400:
			ev = log.Warn()
		default:
			ev = log.Info()
		}

		userID := "-"
		if uid, exists := c.Get("user_id"); exists {
			userID = fmt.Sprintf("%v", uid)
		}

		requestID := "-"
		if rid, exists := c.Get("request_id"); exists {
			requestID = fmt.Sprintf("%v", rid)
		}

		traceID := ""
		if tid, exists := c.Get("trace_id"); exists {
			traceID = fmt.Sprintf("%v", tid)
		}

		spanID := ""
		if sid, exists := c.Get("span_id"); exists {
			spanID = fmt.Sprintf("%v", sid)
		}

		// Sanitize user-controlled strings to prevent log injection.
		safePath := logger.SanitizeLogMessage(path)
		safeAgent := logger.SanitizeLogMessage(c.Request.UserAgent())

		ev = ev.
			Str("request_id", requestID).
			Str("trace_id", traceID).
			Str("span_id", spanID).
			Str("user_id", userID).
			Str("method", c.Request.Method).
			Str("path", safePath).
			Int("status", status).
			Int64("duration_ms", latency.Milliseconds()).
			Int("response_size", c.Writer.Size()).
			Str("client_ip", c.ClientIP()).
			Str("user_agent", safeAgent)

		// Log only public errors — private errors may contain sensitive internal
		// details (tokens, passwords, stack frames).
		if errs := c.Errors.ByType(gin.ErrorTypePublic).String(); errs != "" {
			ev = ev.Str("errors", errs)
		}

		ev.Msg("request")
	}
}

// AuditLogger logs security-relevant events as JSON lines via zerolog.
func AuditLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !isSecurityRelevant(c.Request.Method, c.FullPath()) {
			c.Next()
			return
		}

		userID := "-"
		if uid, exists := c.Get("user_id"); exists {
			userID = fmt.Sprintf("%v", uid)
		}

		requestID := "-"
		if rid, exists := c.Get("request_id"); exists {
			requestID = fmt.Sprintf("%v", rid)
		}

		start := time.Now()
		c.Next()

		status := c.Writer.Status()
		log.Info().
			Str("event_type", "api_access").
			Str("request_id", requestID).
			Str("method", c.Request.Method).
			Str("path", logger.SanitizeLogMessage(c.FullPath())).
			Str("user_id", userID).
			Str("client_ip", c.ClientIP()).
			Int("status", status).
			Bool("success", status < 400).
			Int64("duration_ms", time.Since(start).Milliseconds()).
			Str("level_tag", "AUDIT").
			Msg("audit")
	}
}

// isSecurityRelevant determines if an endpoint should be audit logged.
func isSecurityRelevant(method, path string) bool {
	if method == "POST" || method == "PUT" || method == "DELETE" || method == "PATCH" {
		return true
	}
	sensitive := []string{
		"/api/v1/auth/login",
		"/api/v1/auth/register",
		"/api/v1/auth/logout",
		"/api/v1/users/:id/ban",
		"/api/v1/users/:id/unban",
		"/api/v1/admin",
	}
	for _, ep := range sensitive {
		if path == ep {
			return true
		}
	}
	return false
}

// ErrorReporter logs handler errors via zerolog. Integrate with Sentry separately.
func ErrorReporter() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		for _, ginErr := range c.Errors {
			log.Error().Err(ginErr.Err).Msg("handler error")
		}
	}
}

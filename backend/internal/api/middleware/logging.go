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

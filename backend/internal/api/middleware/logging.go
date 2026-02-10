package middleware

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"log"
)

// LogLevel defines log severity levels
type LogLevel string

const (
	LogLevelDebug LogLevel = "DEBUG"
	LogLevelInfo  LogLevel = "INFO"
	LogLevelWarn  LogLevel = "WARN"
	LogLevelError LogLevel = "ERROR"
	LogLevelFatal LogLevel = "FATAL"
)

// StructuredLogger provides structured logging for requests
func StructuredLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		// Process request
		c.Next()

		// Calculate request duration
		latency := time.Since(start)
		status := c.Writer.Status()
		method := c.Request.Method
		clientIP := c.ClientIP()
		userAgent := c.Request.UserAgent()
		errors := c.Errors.ByType(gin.ErrorTypePrivate).String()

		// Determine log level based on status code
		level := LogLevelInfo
		if status >= 500 {
			level = LogLevelError
		} else if status >= 400 {
			level = LogLevelWarn
		}

		// Get user ID if authenticated
		userID := "-"
		if uid, exists := c.Get("user_id"); exists {
			userID = fmt.Sprintf("%v", uid)
		}

		// Structured log format (JSON-friendly)
		logEntry := map[string]interface{}{
			"timestamp":  start.Format(time.RFC3339),
			"level":      level,
			"method":     method,
			"path":       path,
			"query":      query,
			"status":     status,
			"latency_ms": latency.Milliseconds(),
			"client_ip":  clientIP,
			"user_id":    userID,
			"user_agent": userAgent,
		}

		// Add errors if present
		if errors != "" {
			logEntry["errors"] = errors
		}

		// Log in structured format
		logStructured(logEntry)

		// Alert on errors (for integration with monitoring)
		if status >= 500 {
			alertOnError(logEntry)
		}
	}
}

// logStructured outputs a structured log entry
// In production, this would send to a log aggregation service (Datadog, ELK, etc.)
func logStructured(entry map[string]interface{}) {
	// Format as pseudo-JSON for readability
	// In production, use actual JSON encoding and send to log aggregator
	log.Printf("[%s] %s %s - Status: %d - Latency: %dms - IP: %s - User: %s",
		entry["level"],
		entry["method"],
		entry["path"],
		entry["status"],
		entry["latency_ms"],
		entry["client_ip"],
		entry["user_id"],
	)
}

// alertOnError sends alerts for server errors
// In production, this would integrate with Sentry, PagerDuty, etc.
func alertOnError(entry map[string]interface{}) {
	// TODO: Integrate with Sentry for error tracking
	// sentry.CaptureMessage(fmt.Sprintf("HTTP %d: %s %s", entry["status"], entry["method"], entry["path"]))

	// TODO: Integrate with PagerDuty for critical alerts (5xx errors)
	// if entry["status"].(int) >= 500 {
	//     pagerduty.TriggerIncident(entry)
	// }

	log.Printf("[ALERT] Server error detected: %v", entry)
}

// AuditLogger logs security-relevant events
func AuditLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip audit logging for non-security-relevant endpoints
		if !isSecurityRelevant(c.Request.Method, c.FullPath()) {
			c.Next()
			return
		}

		userID := "-"
		if uid, exists := c.Get("user_id"); exists {
			userID = fmt.Sprintf("%v", uid)
		}

		auditEntry := map[string]interface{}{
			"timestamp":  time.Now().Format(time.RFC3339),
			"event_type": "api_access",
			"method":     c.Request.Method,
			"path":       c.FullPath(),
			"user_id":    userID,
			"client_ip":  c.ClientIP(),
			"user_agent": c.Request.UserAgent(),
		}

		// Process request
		c.Next()

		// Add result
		auditEntry["status"] = c.Writer.Status()
		auditEntry["success"] = c.Writer.Status() < 400

		logAudit(auditEntry)
	}
}

// isSecurityRelevant determines if an endpoint should be audit logged
func isSecurityRelevant(method, path string) bool {
	// Log all state-changing operations
	if method == "POST" || method == "PUT" || method == "DELETE" || method == "PATCH" {
		return true
	}

	// Log access to sensitive endpoints
	sensitiveEndpoints := []string{
		"/api/v1/auth/login",
		"/api/v1/auth/register",
		"/api/v1/auth/logout",
		"/api/v1/users/:id/ban",
		"/api/v1/users/:id/unban",
		"/api/v1/admin",
	}

	for _, endpoint := range sensitiveEndpoints {
		if path == endpoint {
			return true
		}
	}

	return false
}

// logAudit outputs an audit log entry
// In production, send to immutable audit log storage
func logAudit(entry map[string]interface{}) {
	log.Printf("[AUDIT] Event: %s - Method: %s - Path: %s - User: %s - Status: %d - IP: %s",
		entry["event_type"],
		entry["method"],
		entry["path"],
		entry["user_id"],
		entry["status"],
		entry["client_ip"],
	)

	// TODO: Send to audit log aggregation (must be immutable for compliance)
	// auditLogService.Send(entry)
}

// ErrorReporter creates middleware for error reporting to Sentry
func ErrorReporter() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// Check for errors
		if len(c.Errors) > 0 {
			for _, err := range c.Errors {
				// TODO: Send to Sentry
				// sentry.CaptureException(err.Err)

				log.Printf("[ERROR] %v", err.Err)
			}
		}

		// Check for panic recovery
		if c.Writer.Status() >= 500 {
			// TODO: Send stack trace to Sentry
			// This would be caught by gin.Recovery() middleware
		}
	}
}

// RequestIDMiddleware adds a unique request ID to each request
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Generate request ID (simple timestamp-based ID)
		// In production, use UUID or more sophisticated ID generation
		requestID := fmt.Sprintf("%d", time.Now().UnixNano())

		// Add to context
		c.Set("request_id", requestID)

		// Add to response headers for tracing
		c.Writer.Header().Set("X-Request-ID", requestID)

		c.Next()
	}
}

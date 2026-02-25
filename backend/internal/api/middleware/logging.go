package middleware

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// LogLevel defines log severity levels
type LogLevel string

const (
	LogLevelInfo  LogLevel = "INFO"
	LogLevelWarn  LogLevel = "WARN"
	LogLevelError LogLevel = "ERROR"
)

// logEntry is the structured log record emitted for every request.
type logEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	RequestID string `json:"request_id"`
	TraceID   string `json:"trace_id,omitempty"`
	SpanID    string `json:"span_id,omitempty"`
	Method    string `json:"method"`
	Path      string `json:"path"`
	Query     string `json:"query,omitempty"`
	Status    int    `json:"status"`
	LatencyMS int64  `json:"latency_ms"`
	ClientIP  string `json:"client_ip"`
	UserID    string `json:"user_id"`
	UserAgent string `json:"user_agent,omitempty"`
	Errors    string `json:"errors,omitempty"`
}

// StructuredLogger logs each request as a single JSON line to stdout.
// In production, pipe stdout to your log aggregator (ELK, Datadog, etc.).
func StructuredLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		level := LogLevelInfo
		if status >= 500 {
			level = LogLevelError
		} else if status >= 400 {
			level = LogLevelWarn
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

		entry := logEntry{
			Timestamp: start.UTC().Format(time.RFC3339),
			Level:     string(level),
			RequestID: requestID,
			TraceID:   traceID,
			SpanID:    spanID,
			Method:    c.Request.Method,
			Path:      path,
			Query:     query,
			Status:    status,
			LatencyMS: latency.Milliseconds(),
			ClientIP:  c.ClientIP(),
			UserID:    userID,
			UserAgent: c.Request.UserAgent(),
		}

		// Log only public errors — private errors may contain sensitive internal
		// details (tokens, passwords, stack frames) that must never leave the process.
		if errs := c.Errors.ByType(gin.ErrorTypePublic).String(); errs != "" {
			entry.Errors = errs
		}

		line, err := json.Marshal(entry)
		if err != nil {
			log.Printf("[logger] failed to marshal log entry: %v", err)
			return
		}
		log.Println(string(line))

		// Alert on 5xx — TODO: replace with Sentry/PagerDuty integration
		if status >= 500 {
			log.Printf(`{"level":"ALERT","request_id":%q,"path":%q,"status":%d}`,
				requestID, path, status)
		}
	}
}

// AuditLogger logs security-relevant events as JSON lines.
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

		type auditRecord struct {
			Timestamp  string `json:"timestamp"`
			Level      string `json:"level"`
			EventType  string `json:"event_type"`
			RequestID  string `json:"request_id"`
			Method     string `json:"method"`
			Path       string `json:"path"`
			UserID     string `json:"user_id"`
			ClientIP   string `json:"client_ip"`
			Status     int    `json:"status"`
			Success    bool   `json:"success"`
			LatencyMS  int64  `json:"latency_ms"`
		}

		rec := auditRecord{
			Timestamp: start.UTC().Format(time.RFC3339),
			Level:     "AUDIT",
			EventType: "api_access",
			RequestID: requestID,
			Method:    c.Request.Method,
			Path:      c.FullPath(),
			UserID:    userID,
			ClientIP:  c.ClientIP(),
			Status:    c.Writer.Status(),
			Success:   c.Writer.Status() < 400,
			LatencyMS: time.Since(start).Milliseconds(),
		}

		if line, err := json.Marshal(rec); err == nil {
			log.Println(string(line))
		}
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

// ErrorReporter logs handler errors. Integrate with Sentry here when ready.
func ErrorReporter() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		for _, ginErr := range c.Errors {
			// TODO: sentry.CaptureException(ginErr.Err)
			log.Printf(`{"level":"ERROR","error":%q}`, ginErr.Err)
		}
	}
}

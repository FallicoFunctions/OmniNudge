package monitoring

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// MetricsMiddleware records HTTP request metrics
func MetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Process request
		c.Next()

		// Record metrics after request completes
		duration := time.Since(start)
		method := c.Request.Method
		path := c.FullPath() // Use route pattern, not actual path (for better grouping)
		if path == "" {
			path = c.Request.URL.Path // Fallback for unmatched routes
		}
		status := c.Writer.Status()

		RecordHTTPRequest(method, path, status, duration)
	}
}

// WebSocketMetricsTracker tracks WebSocket metrics
type WebSocketMetricsTracker struct{}

// NewWebSocketMetricsTracker creates a new WebSocket metrics tracker
func NewWebSocketMetricsTracker() *WebSocketMetricsTracker {
	return &WebSocketMetricsTracker{}
}

// OnConnect records a new WebSocket connection
func (t *WebSocketMetricsTracker) OnConnect() {
	IncrementWebSocketConnections()
}

// OnDisconnect records a WebSocket disconnection
func (t *WebSocketMetricsTracker) OnDisconnect() {
	DecrementWebSocketConnections()
}

// OnMessageSent records a WebSocket message sent
func (t *WebSocketMetricsTracker) OnMessageSent(messageType string) {
	WebSocketMessagesSent.Inc()
	WebSocketMessagesTotal.WithLabelValues(messageType).Inc()
}

// OnMessageReceived records a WebSocket message received
func (t *WebSocketMetricsTracker) OnMessageReceived(messageType string) {
	WebSocketMessagesReceived.Inc()
	WebSocketMessagesTotal.WithLabelValues(messageType).Inc()
}

// SystemMetricsCollector collects system metrics periodically
type SystemMetricsCollector struct {
	stop chan struct{}
}

// NewSystemMetricsCollector creates a new system metrics collector
func NewSystemMetricsCollector() *SystemMetricsCollector {
	return &SystemMetricsCollector{
		stop: make(chan struct{}),
	}
}

// Start begins collecting system metrics
func (c *SystemMetricsCollector) Start() {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				c.collectMetrics()
			case <-c.stop:
				return
			}
		}
	}()
}

// Stop stops collecting system metrics
func (c *SystemMetricsCollector) Stop() {
	close(c.stop)
}

// collectMetrics collects current system metrics
func (c *SystemMetricsCollector) collectMetrics() {
	// These would normally import runtime and collect real metrics
	// For now, this is a placeholder
	// TODO: Implement actual metric collection
}

// RecordPanic records a panic occurrence
func RecordPanic(panicValue interface{}) {
	RecordError("panic", "critical")
}

// RecordHTTPError records an HTTP error
func RecordHTTPError(status int) {
	severity := "error"
	if status >= 500 {
		severity = "critical"
	} else if status >= 400 {
		severity = "warning"
	}

	errorType := "http_" + strconv.Itoa(status)
	RecordError(errorType, severity)
}

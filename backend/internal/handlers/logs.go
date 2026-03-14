package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/services"
	zlog "github.com/rs/zerolog/log"
	"golang.org/x/time/rate"
)

// FrontendLogEntry represents a log entry from the frontend
type FrontendLogEntry struct {
	Timestamp time.Time              `json:"timestamp"`
	Level     string                 `json:"level"`
	Message   string                 `json:"message"`
	Context   map[string]interface{} `json:"context"`
	UserID    string                 `json:"user_id"`
	SessionID string                 `json:"session_id"`
	PageURL   string                 `json:"page_url"`
	UserAgent string                 `json:"user_agent"`
}

// ipLogLimiterEntry pairs a per-IP rate limiter with the last access time.
type ipLogLimiterEntry struct {
	limiter    *rate.Limiter
	lastAccess time.Time
}

// ipLogLimiters holds per-IP token-bucket limiters for the frontend log endpoint.
// Allows 60 log submissions per minute per IP (1/second steady-state, burst 10).
var (
	ipLogLimitersMu sync.RWMutex
	ipLogLimiters   = make(map[string]*ipLogLimiterEntry)
)

func init() {
	// Background goroutine that evicts stale IP entries once per hour.
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cutoff := time.Now().Add(-24 * time.Hour)
			ipLogLimitersMu.Lock()
			for ip, entry := range ipLogLimiters {
				if entry.lastAccess.Before(cutoff) {
					delete(ipLogLimiters, ip)
				}
			}
			ipLogLimitersMu.Unlock()
		}
	}()
}

// getIPLogLimiter returns (or creates) a per-IP rate limiter for frontend log submissions.
// Allows 60 logs/min per IP: rate=1/s, burst=10.
// BUG-1 fix: lastAccess is updated on EVERY call, not just when stale.
func getIPLogLimiter(ip string) *rate.Limiter {
	ipLogLimitersMu.RLock()
	entry, exists := ipLogLimiters[ip]
	ipLogLimitersMu.RUnlock()

	if exists {
		// Always update lastAccess on every access.
		ipLogLimitersMu.Lock()
		if e, ok := ipLogLimiters[ip]; ok {
			e.lastAccess = time.Now()
		}
		ipLogLimitersMu.Unlock()
		return entry.limiter
	}

	ipLogLimitersMu.Lock()
	defer ipLogLimitersMu.Unlock()
	if e, ok := ipLogLimiters[ip]; ok {
		e.lastAccess = time.Now()
		return e.limiter
	}
	e := &ipLogLimiterEntry{
		// 60 logs/min = 1 per second steady-state; burst of 10 allows short bursts.
		limiter:    rate.NewLimiter(rate.Limit(60.0/60.0), 10),
		lastAccess: time.Now(),
	}
	ipLogLimiters[ip] = e
	return e.limiter
}

// LogHandler handles frontend log submissions
type LogHandler struct {
	analytics *services.AnalyticsService
}

func NewLogHandler(analytics *services.AnalyticsService) *LogHandler {
	return &LogHandler{analytics: analytics}
}

// HandleFrontendLogs handles frontend log submissions.
// @Summary      Submit frontend logs
// @Tags         Logs
// @Accept       json
// @Produce      json
// @Param        body  body      FrontendLogEntry  true  "Log entry"
// @Success      200   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Failure      429   {object}  gin.H
// @Router       /logs/frontend [post]
func (h *LogHandler) HandleFrontendLogs(c *gin.Context) {
	// Per-IP rate limiting: 60 logs per minute per client IP.
	ip := c.ClientIP()
	if !getIPLogLimiter(ip).Allow() {
		RespondError(c, http.StatusTooManyRequests, "Log rate limit exceeded")
		return
	}

	var entry FrontendLogEntry
	if err := c.ShouldBindJSON(&entry); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid log entry")
		return
	}

	// Validate log level (only accept warn and error from frontend)
	if entry.Level != "warn" && entry.Level != "error" {
		RespondError(c, http.StatusBadRequest, "Only warn/error logs accepted")
		return
	}

	// Validate message is not empty
	if entry.Message == "" {
		RespondError(c, http.StatusBadRequest, "Message is required")
		return
	}

	// BUG-3: Cap message length to prevent log flooding.
	if len(entry.Message) > 2048 {
		entry.Message = entry.Message[:2048]
	}

	// BUG-5: Sanitize PageURL — strip newlines and control characters to prevent log injection.
	pageURL := strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, entry.PageURL)

	// Create structured log entry (JSON format for ELK stack)
	logData := map[string]interface{}{
		"timestamp":  entry.Timestamp.Format(time.RFC3339),
		"level":      entry.Level,
		"message":    entry.Message,
		"source":     "frontend",
		"user_id":    entry.UserID,
		"session_id": entry.SessionID,
		"page_url":   pageURL,
		"user_agent": entry.UserAgent,
	}

	// BUG-2: Namespace client context under "context" key with size cap.
	// Do NOT merge entry.Context directly into logData to avoid field overwrites.
	if entry.Context != nil {
		const maxContextKeys = 20
		sanitized := make(map[string]interface{}, maxContextKeys)
		count := 0
		for k, v := range entry.Context {
			if count >= maxContextKeys {
				break
			}
			if s, ok := v.(string); ok && len(s) > 512 {
				v = s[:512]
			}
			sanitized[k] = v
			count++
		}
		logData["context"] = sanitized
	}

	// Convert to JSON for structured logging
	logJSON, err := json.Marshal(logData)
	if err != nil {
		zlog.Error().Err(err).Msg("failed to marshal frontend log entry")
		RespondError(c, http.StatusInternalServerError, "Failed to process log")
		return
	}

	// Log to stdout via zerolog (captured by Filebeat for ELK stack)
	zlog.Info().Str("level", entry.Level).RawJSON("entry", logJSON).Msg("frontend log")

	// If it's an error, also track as an analytics event for automated rollbacks
	if entry.Level == "error" && h.analytics != nil {
		event := services.Event{
			Name:       services.EventErrorOccurred,
			UserID:     nil, // We could parse entry.UserID if it's an int
			Properties: logData,
			UserAgent:  entry.UserAgent,
		}
		// Try to parse SessionID
		if sid, err := uuid.Parse(entry.SessionID); err == nil {
			event.SessionID = &sid
		}

		h.analytics.TrackEvent(c.Request.Context(), event)
	}

	c.JSON(http.StatusOK, gin.H{"status": "logged"})
}

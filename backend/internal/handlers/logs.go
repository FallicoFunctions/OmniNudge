package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
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

// HandleFrontendLogs handles frontend log submissions
func HandleFrontendLogs(c *gin.Context) {
	var entry FrontendLogEntry
	if err := c.ShouldBindJSON(&entry); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid log entry"})
		return
	}

	// Validate log level (only accept warn and error from frontend)
	if entry.Level != "warn" && entry.Level != "error" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only warn/error logs accepted"})
		return
	}

	// Validate message is not empty
	if entry.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message is required"})
		return
	}

	// Rate limiting would happen in middleware
	// TODO: Use rate limiter middleware (60 logs per minute per IP)

	// Create structured log entry (JSON format for ELK stack)
	logData := map[string]interface{}{
		"timestamp":  entry.Timestamp.Format(time.RFC3339),
		"level":      entry.Level,
		"message":    entry.Message,
		"source":     "frontend",
		"user_id":    entry.UserID,
		"session_id": entry.SessionID,
		"page_url":   entry.PageURL,
		"user_agent": entry.UserAgent,
	}

	// Add context fields if present
	if entry.Context != nil {
		for key, value := range entry.Context {
			logData[key] = value
		}
	}

	// Convert to JSON string and log
	logJSON, err := json.Marshal(logData)
	if err != nil {
		log.Printf("[ERROR] Failed to marshal frontend log: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process log"})
		return
	}

	// Log to stdout (will be captured by Filebeat for ELK stack)
	log.Printf("[FRONTEND_%s] %s", entry.Level, string(logJSON))

	c.JSON(http.StatusOK, gin.H{"status": "logged"})
}

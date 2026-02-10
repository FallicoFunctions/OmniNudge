package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/queue"
)

// DataExportHandler handles GDPR data export requests
type DataExportHandler struct {
	db    *pgxpool.Pool
	queue *queue.QueueClient
}

func NewDataExportHandler(db *pgxpool.Pool, queueClient *queue.QueueClient) *DataExportHandler {
	return &DataExportHandler{
		db:    db,
		queue: queueClient,
	}
}

// RequestDataExport initiates a GDPR data export for the user
// POST /api/v1/account/export
func (h *DataExportHandler) RequestDataExport(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		DataTypes      []string `json:"data_types"`      // e.g., ["messages", "posts", "comments", "profile"]
		IncludeDeleted bool     `json:"include_deleted"` // Include soft-deleted data
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Default to all data types if none specified
	if len(req.DataTypes) == 0 {
		req.DataTypes = []string{
			"profile",
			"messages",
			"posts",
			"comments",
			"votes",
			"saved",
			"hubs",
			"settings",
			"encryption_keys",
		}
	}

	// Generate unique export ID
	exportID, err := generateExportID()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate export ID"})
		return
	}

	// Create export request record
	expiresAt := time.Now().Add(7 * 24 * time.Hour) // Export available for 7 days
	_, err = h.db.Exec(context.Background(), `
		INSERT INTO data_export_requests (
			user_id, export_id, data_types, include_deleted, status, expires_at
		) VALUES ($1, $2, $3, $4, 'pending', $5)
	`, userID, exportID, req.DataTypes, req.IncludeDeleted, expiresAt)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create export request"})
		return
	}

	// Enqueue export job
	if h.queue != nil {
		payload := queue.DataExportPayload{
			UserID:         userID,
			ExportID:       exportID,
			DataTypes:      req.DataTypes,
			IncludeDeleted: req.IncludeDeleted,
		}

		if err := h.queue.EnqueueDataExport(context.Background(), payload); err != nil {
			// Update status to failed
			_, _ = h.db.Exec(context.Background(), `
				UPDATE data_export_requests
				SET status = 'failed', completed_at = NOW()
				WHERE export_id = $1
			`, exportID)

			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to queue export job"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Data export request created",
		"export_id":  exportID,
		"status":     "pending",
		"expires_at": expiresAt.Format(time.RFC3339),
		"note":       "You will receive an email when your export is ready. The download link will be valid for 7 days.",
	})
}

// GetExportStatus checks the status of a data export request
// GET /api/v1/account/export/:export_id
func (h *DataExportHandler) GetExportStatus(c *gin.Context) {
	userID := c.GetInt("user_id")
	exportID := c.Param("export_id")

	var status string
	var createdAt, completedAt, expiresAt *time.Time
	var downloadURL *string

	err := h.db.QueryRow(context.Background(), `
		SELECT status, created_at, completed_at, expires_at, download_url
		FROM data_export_requests
		WHERE export_id = $1 AND user_id = $2
	`, exportID, userID).Scan(&status, &createdAt, &completedAt, &expiresAt, &downloadURL)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Export request not found"})
		return
	}

	// Check if expired
	expired := expiresAt != nil && time.Now().After(*expiresAt)

	response := gin.H{
		"export_id":  exportID,
		"status":     status,
		"created_at": createdAt.Format(time.RFC3339),
		"expired":    expired,
	}

	if completedAt != nil {
		response["completed_at"] = completedAt.Format(time.RFC3339)
	}

	if expiresAt != nil {
		response["expires_at"] = expiresAt.Format(time.RFC3339)
	}

	if downloadURL != nil && !expired {
		response["download_url"] = *downloadURL
	}

	if status == "completed" && expired {
		response["message"] = "Export has expired. Please request a new export."
	}

	c.JSON(http.StatusOK, response)
}

// ListExportRequests lists all export requests for the user
// GET /api/v1/account/exports
func (h *DataExportHandler) ListExportRequests(c *gin.Context) {
	userID := c.GetInt("user_id")

	rows, err := h.db.Query(context.Background(), `
		SELECT export_id, status, created_at, completed_at, expires_at, download_url
		FROM data_export_requests
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 20
	`, userID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch export requests"})
		return
	}
	defer rows.Close()

	type ExportRequest struct {
		ExportID    string  `json:"export_id"`
		Status      string  `json:"status"`
		CreatedAt   string  `json:"created_at"`
		CompletedAt *string `json:"completed_at,omitempty"`
		ExpiresAt   *string `json:"expires_at,omitempty"`
		DownloadURL *string `json:"download_url,omitempty"`
		Expired     bool    `json:"expired"`
	}

	exports := []ExportRequest{}
	now := time.Now()

	for rows.Next() {
		var exportID, status string
		var createdAt, completedAt, expiresAt *time.Time
		var downloadURL *string

		if err := rows.Scan(&exportID, &status, &createdAt, &completedAt, &expiresAt, &downloadURL); err != nil {
			continue
		}

		expired := expiresAt != nil && now.After(*expiresAt)

		export := ExportRequest{
			ExportID:  exportID,
			Status:    status,
			CreatedAt: createdAt.Format(time.RFC3339),
			Expired:   expired,
		}

		if completedAt != nil {
			completed := completedAt.Format(time.RFC3339)
			export.CompletedAt = &completed
		}

		if expiresAt != nil {
			expires := expiresAt.Format(time.RFC3339)
			export.ExpiresAt = &expires
		}

		if downloadURL != nil && !expired {
			export.DownloadURL = downloadURL
		}

		exports = append(exports, export)
	}

	c.JSON(http.StatusOK, gin.H{
		"exports": exports,
		"total":   len(exports),
	})
}

// generateExportID generates a unique ID for the export request
func generateExportID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return fmt.Sprintf("export_%s", hex.EncodeToString(bytes)), nil
}

package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/utils"
	zlog "github.com/rs/zerolog/log"
)

// DataExportHandler handles GDPR data export requests
type DataExportHandler struct {
	db        *pgxpool.Pool
	queue     *queue.QueueClient
	storage   services.StorageService
	masterKey []byte
}

func NewDataExportHandler(db *pgxpool.Pool, queueClient *queue.QueueClient, storage services.StorageService, masterKey string) *DataExportHandler {
	return &DataExportHandler{
		db:        db,
		queue:     queueClient,
		storage:   storage,
		masterKey: []byte(masterKey),
	}
}

// RequestDataExport initiates a GDPR data export for the current user.
// @Summary      Request data export
// @Tags         DataExport
// @Security     BearerAuth
// @Produce      json
// @Success      202  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      429  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /account/export [post]
func (h *DataExportHandler) RequestDataExport(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		Password       string   `json:"password" binding:"required"`
		DataTypes      []string `json:"data_types"`      // e.g., ["messages", "posts", "comments", "profile"]
		IncludeDeleted bool     `json:"include_deleted"` // Include soft-deleted data
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request: password is required")
		return
	}

	// 1. Re-authenticate user with password
	var username, passwordHash string
	var encryptedPrivateKey *string
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT username, password_hash, encrypted_private_key FROM users WHERE id = $1
	`, userID).Scan(&username, &passwordHash, &encryptedPrivateKey)

	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch user data")
		return
	}

	if err := utils.CheckPassword(passwordHash, req.Password); err != nil {
		RespondError(c, http.StatusUnauthorized, "Invalid password")
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
		}
	}

	// 2. Prepare E2E session keys if messages are being exported
	usesE2E := false
	for _, dt := range req.DataTypes {
		if dt == "messages" {
			usesE2E = true
			break
		}
	}

	// Generate unique export ID
	exportID, err := generateExportID()
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to generate export ID")
		return
	}

	if usesE2E && encryptedPrivateKey != nil {
		// Decrypt private key using password (using username as salt as per schema)
		// NOTE: In production, a dedicated salt should be used.
		privKeyPEM, err := utils.DecryptWithPassword(*encryptedPrivateKey, req.Password, base64.StdEncoding.EncodeToString([]byte(username)))
		if err != nil {
			zlog.Warn().Int("user_id", userID).Err(err).Msg("private key decryption failed during data export")
			RespondError(c, http.StatusInternalServerError, "Failed to decrypt encryption keys. Please update your security settings.")
			return
		}

		// Fetch group keys for the user
		rows, err := h.db.Query(c.Request.Context(), `
			SELECT gk.id, gkm.encrypted_key_for_user
			FROM group_encryption_keys gk
			JOIN group_key_members gkm ON gk.id = gkm.group_key_id
			WHERE gkm.user_id = $1
		`, userID)
		if err != nil {
			zlog.Warn().Err(err).Msg("failed to fetch group keys during data export")
		} else {
			defer rows.Close()
			for rows.Next() {
				var keyID int
				var encryptedKey string
				if err := rows.Scan(&keyID, &encryptedKey); err != nil {
					continue
				}

				// Decrypt group key with user's RSA private key
				rawKey, err := utils.DecryptRSA(encryptedKey, privKeyPEM)
				if err != nil {
					continue
				}

				// Re-encrypt with system master key for temporary storage
				encryptedWithSystem, err := utils.EncryptWithSystemKey(rawKey, h.masterKey)
				if err != nil {
					continue
				}

				// Store in export_session_keys
				_, _ = h.db.Exec(c.Request.Context(), `
					INSERT INTO export_session_keys (export_id, user_id, group_key_id, encrypted_key)
					VALUES ($1, $2, $3, $4)
					ON CONFLICT (export_id, group_key_id) DO UPDATE SET encrypted_key = EXCLUDED.encrypted_key
				`, exportID, userID, keyID, encryptedWithSystem)
			}
		}
	}

	// Create export request record
	expiresAt := time.Now().Add(7 * 24 * time.Hour) // Export available for 7 days
	_, err = h.db.Exec(c.Request.Context(), `
		INSERT INTO data_export_requests (
			user_id, export_id, data_types, include_deleted, status, expires_at
		) VALUES ($1, $2, $3, $4, 'pending', $5)
	`, userID, exportID, req.DataTypes, req.IncludeDeleted, expiresAt)

	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create export request")
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

		if err := h.queue.EnqueueDataExport(c.Request.Context(), payload); err != nil {
			// Update status to failed
			_, _ = h.db.Exec(c.Request.Context(), `
				UPDATE data_export_requests
				SET status = 'failed', completed_at = NOW()
				WHERE export_id = $1
			`, exportID)

			RespondError(c, http.StatusInternalServerError, "Failed to queue export job")
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

// GetExportStatus checks the status of a data export request.
// @Summary      Get export status
// @Tags         DataExport
// @Security     BearerAuth
// @Produce      json
// @Param        export_id  path  string  true  "Export ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /account/export/{export_id} [get]
func (h *DataExportHandler) GetExportStatus(c *gin.Context) {
	userID := c.GetInt("user_id")
	exportID := c.Param("export_id")

	var status string
	var createdAt, completedAt, expiresAt *time.Time
	err := h.db.QueryRow(context.Background(), `
		SELECT status, created_at, completed_at, expires_at
		FROM data_export_requests
		WHERE export_id = $1 AND user_id = $2
	`, exportID, userID).Scan(&status, &createdAt, &completedAt, &expiresAt)

	if err != nil {
		RespondError(c, http.StatusNotFound, "Export request not found")
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

	if status == "completed" && !expired {
		response["download_ready"] = true
	}

	if status == "completed" && expired {
		response["message"] = "Export has expired. Please request a new export."
	}

	c.JSON(http.StatusOK, response)
}

// ListExportRequests lists all data export requests for the current user.
// @Summary      List export requests
// @Tags         DataExport
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}   gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /account/exports [get]
func (h *DataExportHandler) ListExportRequests(c *gin.Context) {
	userID := c.GetInt("user_id")

	rows, err := h.db.Query(context.Background(), `
		SELECT export_id, status, created_at, completed_at, expires_at
		FROM data_export_requests
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 20
	`, userID)

	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch export requests")
		return
	}
	defer rows.Close()

	type ExportRequest struct {
		ExportID      string  `json:"export_id"`
		Status        string  `json:"status"`
		CreatedAt     string  `json:"created_at"`
		CompletedAt   *string `json:"completed_at,omitempty"`
		ExpiresAt     *string `json:"expires_at,omitempty"`
		Expired       bool    `json:"expired"`
		DownloadReady bool    `json:"download_ready"`
	}

	exports := []ExportRequest{}
	now := time.Now()

	for rows.Next() {
		var exportID, status string
		var createdAt, completedAt, expiresAt *time.Time

		if err := rows.Scan(&exportID, &status, &createdAt, &completedAt, &expiresAt); err != nil {
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

		export.DownloadReady = status == "completed" && !expired

		exports = append(exports, export)
	}

	c.JSON(http.StatusOK, gin.H{
		"exports": exports,
		"total":   len(exports),
	})
}

// DownloadExport streams a completed export to its owner.
func (h *DataExportHandler) DownloadExport(c *gin.Context) {
	userID := c.GetInt("user_id")
	exportID := c.Param("export_id")

	var status string
	var expiresAt time.Time
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT status, expires_at
		FROM data_export_requests
		WHERE export_id = $1 AND user_id = $2
	`, exportID, userID).Scan(&status, &expiresAt)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Export request not found")
		return
	}
	if status != "completed" {
		RespondError(c, http.StatusConflict, "Export is not ready")
		return
	}
	if time.Now().After(expiresAt) {
		RespondError(c, http.StatusGone, "Export has expired")
		return
	}
	if h.storage == nil {
		RespondError(c, http.StatusServiceUnavailable, "Export download unavailable")
		return
	}

	storageKey := fmt.Sprintf("exports/%d/%s.zip", userID, exportID)
	reader, err := h.storage.Download(c.Request.Context(), storageKey)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Export file not found")
		return
	}
	defer reader.Close()

	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.zip\"", exportID))
	if _, err := io.Copy(c.Writer, reader); err != nil {
		c.Error(err)
	}
}

// generateExportID generates a unique ID for the export request
func generateExportID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return fmt.Sprintf("export_%s", hex.EncodeToString(bytes)), nil
}

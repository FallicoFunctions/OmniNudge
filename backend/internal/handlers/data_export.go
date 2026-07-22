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
	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/utils"
)

// DataExportHandler handles GDPR data export requests
type DataExportHandler struct {
	db        *pgxpool.Pool
	queue     dataExportEnqueuer
	storage   services.StorageService
	masterKey []byte
}

type dataExportEnqueuer interface {
	EnqueueDataExport(context.Context, queue.DataExportPayload) error
}

func NewDataExportHandler(db *pgxpool.Pool, queueClient dataExportEnqueuer, storage services.StorageService, masterKey string) *DataExportHandler {
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

	// Default to all data types if none specified, otherwise strictly allowlist
	// and deduplicate the requested export sections. Besides avoiding wasted work,
	// this keeps user-controlled values out of temporary filenames in the worker.
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
	} else {
		allowed := map[string]struct{}{
			"profile": {}, "messages": {}, "posts": {}, "comments": {},
			"votes": {}, "saved": {}, "hubs": {}, "settings": {},
		}
		seen := make(map[string]struct{}, len(req.DataTypes))
		validated := make([]string, 0, len(req.DataTypes))
		for _, dataType := range req.DataTypes {
			if _, ok := allowed[dataType]; !ok {
				RespondError(c, http.StatusBadRequest, "Unsupported data type")
				return
			}
			if _, duplicate := seen[dataType]; duplicate {
				continue
			}
			seen[dataType] = struct{}{}
			validated = append(validated, dataType)
		}
		req.DataTypes = validated
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
	if h.queue == nil {
		RespondError(c, http.StatusServiceUnavailable, "Data export is temporarily unavailable")
		return
	}

	// Serialize requests per user so concurrent submissions cannot bypass the
	// active-export and daily limits.
	tx, err := h.db.Begin(c.Request.Context())
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create export request")
		return
	}
	defer tx.Rollback(c.Request.Context()) //nolint:errcheck
	if _, err = tx.Exec(c.Request.Context(), `SELECT pg_advisory_xact_lock($1)`, int64(userID)); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create export request")
		return
	}
	var activeCount, recentCount int
	if err = tx.QueryRow(c.Request.Context(), `
		SELECT
			COUNT(*) FILTER (WHERE status IN ('pending', 'processing')),
			COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')
		FROM data_export_requests
		WHERE user_id = $1
	`, userID).Scan(&activeCount, &recentCount); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create export request")
		return
	}
	if activeCount > 0 || recentCount >= 3 {
		RespondError(c, http.StatusTooManyRequests, "Data export limit reached; try again later")
		return
	}

	// The parent row must exist before export_session_keys because the latter has
	// a foreign key to data_export_requests(export_id).
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	if _, err = tx.Exec(c.Request.Context(), `
		INSERT INTO data_export_requests (
			user_id, export_id, data_types, include_deleted, status, expires_at
		) VALUES ($1, $2, $3, $4, 'pending', $5)
	`, userID, exportID, req.DataTypes, req.IncludeDeleted, expiresAt); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create export request")
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
		rows, err := tx.Query(c.Request.Context(), `
			SELECT gk.id, gkm.encrypted_key_for_user
			FROM group_encryption_keys gk
			JOIN group_key_members gkm ON gk.id = gkm.group_key_id
			WHERE gkm.user_id = $1
		`, userID)
		if err != nil {
			zlog.Warn().Err(err).Msg("failed to fetch group keys during data export")
			RespondError(c, http.StatusInternalServerError, "Failed to prepare encrypted export")
			return
		} else {
			type preparedKey struct {
				id        int
				encrypted string
			}
			prepared := make([]preparedKey, 0)
			for rows.Next() {
				var keyID int
				var encryptedKey string
				if err := rows.Scan(&keyID, &encryptedKey); err != nil {
					rows.Close()
					RespondError(c, http.StatusInternalServerError, "Failed to prepare encrypted export")
					return
				}

				// Decrypt group key with user's RSA private key
				rawKey, err := utils.DecryptRSA(encryptedKey, privKeyPEM)
				if err != nil {
					rows.Close()
					RespondError(c, http.StatusInternalServerError, "Failed to prepare encrypted export")
					return
				}

				// Re-encrypt with system master key for temporary storage
				encryptedWithSystem, err := utils.EncryptWithSystemKey(rawKey, h.masterKey)
				if err != nil {
					rows.Close()
					RespondError(c, http.StatusInternalServerError, "Failed to prepare encrypted export")
					return
				}

				prepared = append(prepared, preparedKey{id: keyID, encrypted: encryptedWithSystem})
			}
			rowsErr := rows.Err()
			rows.Close()
			if rowsErr != nil {
				RespondError(c, http.StatusInternalServerError, "Failed to prepare encrypted export")
				return
			}
			for _, key := range prepared {
				if _, err := tx.Exec(c.Request.Context(), `
					INSERT INTO export_session_keys (export_id, user_id, group_key_id, encrypted_key)
					VALUES ($1, $2, $3, $4)
					ON CONFLICT (export_id, group_key_id) DO UPDATE SET encrypted_key = EXCLUDED.encrypted_key
				`, exportID, userID, key.id, key.encrypted); err != nil {
					RespondError(c, http.StatusInternalServerError, "Failed to prepare encrypted export")
					return
				}
			}
		}
	}

	if err := tx.Commit(c.Request.Context()); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create export request")
		return
	}

	// Enqueue export job
	payload := queue.DataExportPayload{
		ExportID: exportID,
	}

	if err := h.queue.EnqueueDataExport(c.Request.Context(), payload); err != nil {
		// Mark failed and purge short-lived decrypted session material when the
		// export cannot be queued. A later request can then retry safely.
		_, _ = h.db.Exec(c.Request.Context(), `
			WITH deleted_keys AS (
				DELETE FROM export_session_keys WHERE export_id = $1
			)
			UPDATE data_export_requests
			SET status = 'failed', completed_at = NOW()
			WHERE export_id = $1
		`, exportID)

		RespondError(c, http.StatusServiceUnavailable, "Failed to queue export job")
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
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
	err := h.db.QueryRow(c.Request.Context(), `
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

	rows, err := h.db.Query(c.Request.Context(), `
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
		c.Error(err) //nolint:errcheck // gin c.Error return value is not actionable here; response streaming already failed
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

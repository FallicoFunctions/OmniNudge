package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/services"
)

const maxVoiceFileSize = 10 * 1024 * 1024 // 10 MB

// VoiceMessagesHandler handles HTTP requests for voice messages.
type VoiceMessagesHandler struct {
	pool                *pgxpool.Pool
	storage             services.StorageService
	virusScanner        services.VirusScanner // may be nil
	hub                 HubInterface
	queueClient         *queue.QueueClient // may be nil
	virusScanFailClosed bool               // when true, reject uploads if scan errors
}

// NewVoiceMessagesHandler creates a new VoiceMessagesHandler.
func NewVoiceMessagesHandler(
	pool *pgxpool.Pool,
	storage services.StorageService,
	virusScanner services.VirusScanner,
	hub HubInterface,
	queueClient *queue.QueueClient,
	virusScanFailClosed bool,
) *VoiceMessagesHandler {
	return &VoiceMessagesHandler{
		pool:                pool,
		storage:             storage,
		virusScanner:        virusScanner,
		hub:                 hub,
		queueClient:         queueClient,
		virusScanFailClosed: virusScanFailClosed,
	}
}

// extFromMIME returns a simple file extension for an audio MIME type.
func extFromMIME(mimeType string) string {
	base := strings.TrimSpace(strings.SplitN(mimeType, ";", 2)[0])
	switch base {
	case "audio/webm":
		return "webm"
	case "audio/ogg":
		return "ogg"
	case "audio/mp4", "audio/m4a":
		return "m4a"
	case "audio/mpeg", "audio/mp3":
		return "mp3"
	case "audio/wav", "audio/wave":
		return "wav"
	default:
		exts, err := mime.ExtensionsByType(base)
		if err == nil && len(exts) > 0 {
			return strings.TrimPrefix(exts[0], ".")
		}
		return "bin"
	}
}

// UploadVoice attaches a voice recording to a message.
// @Summary      Upload voice message
// @Tags         VoiceMessages
// @Security     BearerAuth
// @Accept       multipart/form-data
// @Produce      json
// @Param        id     path      int   true  "Message ID"
// @Param        audio  formData  file  true  "Audio file"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/{id}/voice [post]
func (h *VoiceMessagesHandler) UploadVoice(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	// Verify message exists and belongs to the caller.
	var ownerID int
	err = h.pool.QueryRow(c.Request.Context(),
		`SELECT sender_id FROM messages WHERE id = $1`, messageID,
	).Scan(&ownerID)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Message not found")
		return
	}
	if ownerID != userID {
		RespondError(c, http.StatusForbidden, "Forbidden")
		return
	}

	// Parse multipart form.
	if err := c.Request.ParseMultipartForm(11 * 1024 * 1024); err != nil {
		RespondError(c, http.StatusBadRequest, "Failed to parse form")
		return
	}

	file, header, err := c.Request.FormFile("audio")
	if err != nil {
		RespondError(c, http.StatusBadRequest, "No audio file provided")
		return
	}
	defer file.Close()

	// Validate file size against client-supplied header as an early DDoS guard.
	// Authoritative size check is done after writing (below).
	if header.Size > maxVoiceFileSize {
		RespondError(c, http.StatusBadRequest, "File too large (max 10MB)")
		return
	}

	// Parse duration.
	durationStr := c.PostForm("duration_seconds")
	if durationStr == "" {
		RespondError(c, http.StatusBadRequest, "duration_seconds is required")
		return
	}
	durationSeconds, err := strconv.ParseFloat(durationStr, 64)
	if err != nil || durationSeconds <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid duration_seconds")
		return
	}
	const maxDurationSeconds = 300 // 5 minutes
	if durationSeconds > maxDurationSeconds {
		RespondError(c, http.StatusBadRequest, "Voice messages are limited to 5 minutes")
		return
	}

	// Write to temp file for virus scanning.
	tmpFile, err := os.CreateTemp("", "voice-upload-*")
	if err != nil {
		log.Printf("voice upload: create temp file: %v", err)
		RespondError(c, http.StatusInternalServerError, "Internal error")
		return
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	limited := io.LimitReader(file, maxVoiceFileSize+1)
	written, err := io.Copy(tmpFile, limited)
	tmpFile.Close()
	if err != nil {
		log.Printf("voice upload: write temp file: %v", err)
		RespondError(c, http.StatusInternalServerError, "Internal error")
		return
	}
	// Authoritative size check — client-supplied header.Size is untrusted.
	if written > maxVoiceFileSize {
		RespondError(c, http.StatusBadRequest, "File too large (max 10MB)")
		return
	}

	// Detect MIME type from actual file bytes — never trust the client-supplied
	// Content-Type header alone; it can be forged to bypass the audio-only check.
	sniffBuf := make([]byte, 512)
	sniffFile, err := os.Open(tmpPath)
	if err != nil {
		log.Printf("voice upload: open for sniff: %v", err)
		RespondError(c, http.StatusInternalServerError, "Internal error")
		return
	}
	n, _ := sniffFile.Read(sniffBuf)
	sniffFile.Close()

	detectedMIME := http.DetectContentType(sniffBuf[:n])
	// Use the detected MIME; fall back to the client header only when the
	// detector returns the generic "application/octet-stream" (i.e. unknown).
	mimeType := detectedMIME
	if detectedMIME == "application/octet-stream" {
		clientMIME := header.Header.Get("Content-Type")
		if clientMIME != "" {
			mimeType = strings.TrimSpace(strings.SplitN(clientMIME, ";", 2)[0])
		}
	}
	baseMIME := strings.TrimSpace(strings.SplitN(mimeType, ";", 2)[0])
	if !strings.HasPrefix(baseMIME, "audio/") {
		RespondError(c, http.StatusBadRequest, "File must be an audio file")
		return
	}

	// Virus scan (optional).
	scanStatus := "skipped"
	if h.virusScanner != nil {
		result, scanErr := h.virusScanner.ScanFile(c.Request.Context(), tmpPath)
		if scanErr != nil {
			log.Printf("voice upload: virus scan error: %v", scanErr)
			if h.virusScanFailClosed {
				RespondError(c, http.StatusServiceUnavailable, "Upload temporarily unavailable while security scanning is offline")
				return
			}
			// Fail open — treat as skipped.
		} else if result.Infected {
			RespondError(c, http.StatusBadRequest, "File rejected by virus scanner")
			return
		} else {
			scanStatus = "clean"
		}
	}

	// Generate storage key.
	ext := extFromMIME(mimeType)
	storageKey := fmt.Sprintf("voice/%d/%d/%s.%s", userID, messageID, uuid.NewString(), ext)

	// Upload to storage.
	f, err := os.Open(tmpPath)
	if err != nil {
		log.Printf("voice upload: open temp file for upload: %v", err)
		RespondError(c, http.StatusInternalServerError, "Internal error")
		return
	}
	defer f.Close()

	if _, err := h.storage.Upload(c.Request.Context(), storageKey, f, mimeType); err != nil {
		log.Printf("voice upload: storage upload failed: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to store audio file")
		return
	}

	fileSize := header.Size
	if info, statErr := os.Stat(tmpPath); statErr == nil {
		fileSize = info.Size()
	}

	// Insert into voice_messages.
	var voiceMessageID int
	err = h.pool.QueryRow(c.Request.Context(), `
		INSERT INTO voice_messages (message_id, duration_seconds, storage_key, file_size, mime_type, scan_status)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, messageID, durationSeconds, storageKey, fileSize, mimeType, scanStatus).Scan(&voiceMessageID)
	if err != nil {
		log.Printf("voice upload: db insert: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to save voice message")
		return
	}

	// Enqueue waveform generation job.
	if h.queueClient != nil {
		payload := queue.WaveformJobPayload{
			VoiceMessageID: voiceMessageID,
			StorageKey:     storageKey,
		}
		if _, err := h.queueClient.EnqueueJob(c.Request.Context(), queue.JobTypeWaveform, payload); err != nil {
			log.Printf("voice upload: enqueue waveform job: %v", err)
			// Non-fatal.
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"voice_message_id": voiceMessageID,
		"duration_seconds": durationSeconds,
	})
}

// GetVoiceMessage returns metadata for a voice message.
// @Summary      Get voice message
// @Tags         VoiceMessages
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Message ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/{id}/voice [get]
func (h *VoiceMessagesHandler) GetVoiceMessage(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	var (
		id              int
		msgID           int
		durationSeconds float64
		waveformRaw     *string
		transcription   *string
		storageKey      string
		fileSize        int64
		mimeType        string
		hasAccess       bool
	)

	// Verify caller is a participant in the conversation containing this message.
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT vm.id, vm.message_id, vm.duration_seconds, vm.waveform_data::text,
		       vm.transcription, vm.storage_key, vm.file_size, vm.mime_type,
		       EXISTS(
		           SELECT 1
		           FROM conversation_participants cp
		           JOIN messages m ON m.conversation_id = cp.conversation_id
		           WHERE m.id = vm.message_id AND cp.user_id = $2
		       ) AS has_access
		FROM voice_messages vm
		WHERE vm.message_id = $1
	`, messageID, userID).Scan(&id, &msgID, &durationSeconds, &waveformRaw, &transcription, &storageKey, &fileSize, &mimeType, &hasAccess)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Voice message not found")
		return
	}
	if !hasAccess {
		RespondError(c, http.StatusForbidden, "Forbidden")
		return
	}

	signedURL, err := h.storage.GetSignedURL(c.Request.Context(), storageKey, time.Hour)
	if err != nil {
		log.Printf("voice get: signed URL: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to generate download URL")
		return
	}

	var waveformData interface{}
	if waveformRaw != nil {
		waveformData = json.RawMessage(*waveformRaw)
	}

	c.JSON(http.StatusOK, gin.H{
		"id":               id,
		"message_id":       msgID,
		"duration_seconds": durationSeconds,
		"waveform_data":    waveformData,
		"transcription":    transcription,
		"signed_url":       signedURL,
		"mime_type":        mimeType,
		"file_size":        fileSize,
	})
}

// DownloadVoice streams the audio file for a voice message.
// @Summary      Download voice message
// @Tags         VoiceMessages
// @Security     BearerAuth
// @Produce      application/octet-stream
// @Param        id  path  int  true  "Voice message ID"
// @Success      200
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /voice/{id}/download [get]
func (h *VoiceMessagesHandler) DownloadVoice(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	voiceID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid voice message ID")
		return
	}

	var storageKey string
	var hasAccess bool
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT vm.storage_key,
		       EXISTS(
		           SELECT 1
		           FROM conversation_participants cp
		           JOIN conversations cv ON cv.id = cp.conversation_id
		           JOIN messages m ON m.conversation_id = cv.id
		           WHERE m.id = vm.message_id AND cp.user_id = $2
		       ) AS has_access
		FROM voice_messages vm
		WHERE vm.id = $1
	`, voiceID, userID).Scan(&storageKey, &hasAccess)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Voice message not found")
		return
	}
	if !hasAccess {
		RespondError(c, http.StatusForbidden, "Forbidden")
		return
	}

	signedURL, err := h.storage.GetSignedURL(c.Request.Context(), storageKey, time.Hour)
	if err != nil {
		log.Printf("voice download: signed URL: %v", err)
		RespondError(c, http.StatusInternalServerError, "Failed to generate download URL")
		return
	}

	c.Redirect(http.StatusFound, signedURL)
}

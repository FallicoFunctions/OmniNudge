package handlers

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/services"
	zlog "github.com/rs/zerolog/log"
)

const (
	maxUploadSize      = 100 * 1024 * 1024 // 100MB hard cap (largest allowed class: video)
	maxBatchUploadSize = 250 * 1024 * 1024 // 250MB total multipart body limit for batch uploads
	maxBatchFiles      = 10
	maxImageDimension  = 8000
)

// presignTTL is the validity window for S3 presigned PUT URLs.
// Adjust via rebuild if a different value is needed for your deployment.
const presignTTL = time.Hour

var presignSafeNameRe = regexp.MustCompile(`[^a-zA-Z0-9._-]`)

type MediaQuotaConfig struct {
	FreeTierBytes int64
	ProTierBytes  int64
}

// MediaHandler handles media uploads
type MediaHandler struct {
	mediaRepo           ports.MediaFileRepository
	thumbnailService    *services.ThumbnailService
	queueClient         queue.MediaJobEnqueuer
	quota               MediaQuotaConfig
	virusScanFailClosed bool
	// s3Service is set only when STORAGE_BACKEND=s3; nil for local storage.
	s3Service *services.S3StorageService
	// storageBackend is "local" or "s3".
	storageBackend string
	// storageService is the general storage backend used for all uploads.
	storageService services.StorageService
	uploadIntents  presignedUploadRepository
}

type presignedUploadRepository interface {
	ReserveUploadIntent(context.Context, *models.MediaUploadIntent, int64) error
	GetUploadIntentOwned(context.Context, uuid.UUID, int) (*models.MediaUploadIntent, error)
	FinalizeUploadIntent(context.Context, uuid.UUID, int, int64, int64, string) (int, bool, error)
	RollbackConfirmedUpload(context.Context, uuid.UUID, int, string) error
	MarkUploadIntentFailed(context.Context, uuid.UUID, int, string) error
}

// NewMediaHandler creates a new media handler
func NewMediaHandler(
	mediaRepo ports.MediaFileRepository,
	thumbnailService *services.ThumbnailService,
	queueClient queue.MediaJobEnqueuer,
	quota MediaQuotaConfig,
	virusScanFailClosed bool,
) *MediaHandler {
	if quota.FreeTierBytes <= 0 {
		quota.FreeTierBytes = 1 * 1024 * 1024 * 1024
	}
	if quota.ProTierBytes <= 0 {
		quota.ProTierBytes = 50 * 1024 * 1024 * 1024
	}
	return &MediaHandler{
		mediaRepo:           mediaRepo,
		thumbnailService:    thumbnailService,
		queueClient:         queueClient,
		quota:               quota,
		virusScanFailClosed: virusScanFailClosed,
		storageBackend:      "local",
	}
}

// SetS3Service injects the S3 storage service and marks the storage backend as "s3".
// Call this in main.go when STORAGE_BACKEND=s3.
func (h *MediaHandler) SetS3Service(svc *services.S3StorageService) {
	h.s3Service = svc
	h.storageBackend = "s3"
	h.storageService = svc
}

// SetStorageService injects a general StorageService into the handler.
// This enables all uploads to go through the configured backend (local or S3).
func (h *MediaHandler) SetStorageService(svc services.StorageService) {
	h.storageService = svc
}

// SetPresignedUploadRepository enables the tracked direct-upload lifecycle.
func (h *MediaHandler) SetPresignedUploadRepository(repo presignedUploadRepository) {
	h.uploadIntents = repo
}

// UploadMedia uploads a media file.
// @Summary      Upload media
// @Tags         Media
// @Security     BearerAuth
// @Accept       multipart/form-data
// @Produce      json
// @Param        file  formData  file  true  "Media file"
// @Success      201  {object}  models.MediaFile
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      413  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /media/upload [post]
func (h *MediaHandler) UploadMedia(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	// Enforce max body size early
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadSize+1024)

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		RespondError(c, http.StatusBadRequest, "File is required")
		return
	}
	defer file.Close()
	if header.Size <= 0 {
		RespondError(c, http.StatusBadRequest, "Empty file is not allowed")
		return
	}

	usedBytes, err := h.mediaRepo.GetTrackedStorageByUserID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to evaluate storage quota")
		return
	}
	capBytes := resolveStorageCapForRole(c.GetString("role"), h.quota)
	if usedBytes+header.Size > capBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{
			"error":            "Storage quota exceeded",
			"storage_used":     usedBytes,
			"incoming_size":    header.Size,
			"storage_quota":    capBytes,
			"storage_quota_gb": capBytes / (1024 * 1024 * 1024),
		})
		return
	}

	uploadDir := "uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to prepare storage directory")
		return
	}

	safeName := filepath.Base(header.Filename)
	if !middleware.ValidateFileExtension(safeName) {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{
			"error": "Unsupported file extension",
			"name":  safeName,
		})
		return
	}
	newName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
	storagePath := filepath.Join(uploadDir, newName)

	dst, err := os.Create(storagePath)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create file")
		return
	}
	defer dst.Close()

	limited := io.LimitReader(file, maxUploadSize+1)
	var sniff [512]byte
	n, _ := io.ReadFull(limited, sniff[:])
	total := int64(n)

	// Detect content type from data, fallback to header
	contentType := header.Header.Get("Content-Type")
	if detected := http.DetectContentType(sniff[:n]); detected != "" {
		contentType = detected
	}
	contentType = middleware.NormalizeDetectedMIME(safeName, contentType)

	// Validate MIME type (P0-008 Security Audit)
	if !middleware.ValidateMIMEType(contentType, middleware.AllowedMediaTypes) {
		_ = os.Remove(storagePath)
		c.JSON(http.StatusUnsupportedMediaType, gin.H{
			"error": "Unsupported file type",
			"type":  contentType,
			"allowed": []string{
				"Images: JPEG, PNG, GIF, WebP (max 10MB)",
				"Audio/Voice: MP3, M4A, OGG, WAV, WebM, Opus (max 10MB)",
				"Video: MP4, WebM, MOV, MKV (max 100MB)",
				"Documents/Files: PDF, DOC, DOCX, TXT, ZIP (max 25MB)",
			},
		})
		return
	}
	if !middleware.ValidateNoSuspiciousSignatures(sniff[:n], contentType) {
		_ = os.Remove(storagePath)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "File contains suspicious embedded signatures",
			"type":  contentType,
		})
		return
	}
	if !middleware.ValidateExtensionMatchesMIME(safeName, contentType) {
		_ = os.Remove(storagePath)
		c.JSON(http.StatusUnsupportedMediaType, gin.H{
			"error": "File extension does not match detected content type",
			"name":  safeName,
			"type":  contentType,
		})
		return
	}

	// Validate file size for MIME type
	maxSizeForType := middleware.GetMaxSizeForMIME(contentType)
	if total > maxSizeForType {
		_ = os.Remove(storagePath)
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{
			"error":       "File size exceeds limit for this file type",
			"type":        contentType,
			"file_size":   total,
			"max_size":    maxSizeForType,
			"max_size_mb": maxSizeForType / (1024 * 1024),
		})
		return
	}

	if n > 0 {
		if _, err := dst.Write(sniff[:n]); err != nil {
			_ = os.Remove(storagePath)
			RespondError(c, http.StatusInternalServerError, "Failed to save file")
			return
		}
	}

	written, err := io.Copy(dst, limited)
	total += written
	if err != nil {
		_ = os.Remove(storagePath)
		RespondError(c, http.StatusInternalServerError, "Failed to save file")
		return
	}

	if total > maxUploadSize {
		_ = os.Remove(storagePath)
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{
			"error":       "File size exceeds service upload limit",
			"file_size":   total,
			"max_size":    maxUploadSize,
			"max_size_mb": maxUploadSize / (1024 * 1024),
		})
		return
	}

	if total > maxSizeForType {
		_ = os.Remove(storagePath)
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{
			"error":       "File size exceeds limit for this file type",
			"type":        contentType,
			"file_size":   total,
			"max_size":    maxSizeForType,
			"max_size_mb": maxSizeForType / (1024 * 1024),
		})
		return
	}

	// BUG-11: Post-upload quota check using the actual written total (not client-reported header.Size).
	// The pre-check above uses header.Size as a DDoS guard; this is the authoritative check.
	if usedBytes+total > capBytes {
		_ = os.Remove(storagePath)
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{
			"error":         "Storage quota exceeded",
			"storage_used":  usedBytes,
			"incoming_size": total,
			"storage_quota": capBytes,
		})
		return
	}

	if err := middleware.ValidateStrictDocumentStructure(storagePath, safeName, contentType, sniff[:n]); err != nil {
		_ = os.Remove(storagePath)
		zlog.Warn().Err(err).Str("name", safeName).Str("type", contentType).Msg("invalid document structure")
		c.JSON(http.StatusUnsupportedMediaType, gin.H{
			"error": "Invalid document structure",
			"name":  safeName,
			"type":  contentType,
		})
		return
	}

	var usedInMessageID *int
	if val := c.PostForm("used_in_message_id"); val != "" {
		if id, err := strconv.Atoi(val); err == nil {
			usedInMessageID = &id
		}
	}

	storageURL := "/uploads/" + newName
	if h.storageService != nil {
		uploadFile, openErr := os.Open(storagePath)
		if openErr != nil {
			_ = os.Remove(storagePath)
			RespondError(c, http.StatusInternalServerError, "Failed to open file for storage upload")
			return
		}
		uploadedURL, uploadErr := h.storageService.Upload(c.Request.Context(), newName, uploadFile, contentType)
		uploadFile.Close()
		if uploadErr != nil {
			_ = os.Remove(storagePath)
			zlog.Error().Err(uploadErr).Str("key", newName).Msg("storage upload failed")
			RespondError(c, http.StatusInternalServerError, "Failed to upload file to storage backend")
			return
		}
		storageURL = uploadedURL
		if h.storageBackend == "s3" {
			_ = os.Remove(storagePath)
		}
	}

	media := &models.MediaFile{
		UserID:           userID,
		Filename:         newName,
		OriginalFilename: safeName,
		FileType:         contentType,
		FileSize:         total,
		StorageURL:       storageURL,
		StoragePath:      storagePath,
		UsedInMessageID:  usedInMessageID,
	}

	// Extract dimensions for images (thumbnail generation is async when queue is available)
	if services.IsImageType(contentType) {
		width, height, err := h.thumbnailService.GetImageDimensions(storagePath)
		if err == nil {
			if width > maxImageDimension || height > maxImageDimension {
				_ = os.Remove(storagePath)
				c.JSON(http.StatusBadRequest, gin.H{
					"error":         "Image dimensions exceed limit",
					"max_dimension": maxImageDimension,
					"width":         width,
					"height":        height,
				})
				return
			}
			media.Width = &width
			media.Height = &height
		}
	}

	if err := h.mediaRepo.Create(c.Request.Context(), media); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to save media record")
		return
	}

	if err := h.schedulePostUploadJobs(c.Request.Context(), media); err != nil {
		_ = os.Remove(storagePath)
		if deleteErr := h.mediaRepo.DeleteByID(c.Request.Context(), media.ID); deleteErr != nil {
			zlog.Warn().Err(deleteErr).Int("media_id", media.ID).Msg("failed to rollback media record after scan enqueue failure")
		}
		RespondError(c, http.StatusServiceUnavailable, "Upload temporarily unavailable while security scanning is offline")
		return
	}

	c.JSON(http.StatusCreated, media)
}

// GetThumbnail returns the thumbnail for a media file.
// @Summary      Get file thumbnail
// @Tags         Media
// @Security     BearerAuth
// @Produce      image/jpeg
// @Param        id  path  int  true  "File ID"
// @Success      200
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /files/{id}/thumbnail [get]
func (h *MediaHandler) GetThumbnail(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	role := c.GetString("role")

	mediaID, err := strconv.Atoi(c.Param("id"))
	if err != nil || mediaID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid media ID")
		return
	}

	media, err := h.mediaRepo.GetByID(c.Request.Context(), mediaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			RespondError(c, http.StatusNotFound, "Media file not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to fetch media file")
		return
	}

	if media.UserID != userID && role != "admin" && role != "moderator" {
		RespondError(c, http.StatusForbidden, "Forbidden")
		return
	}

	switch media.ScanStatus {
	case models.MediaScanStatusClean:
	case models.MediaScanStatusInfected:
		RespondError(c, http.StatusGone, "File is unavailable")
		return
	default:
		c.JSON(http.StatusLocked, gin.H{
			"error":       "File is not available until security scan completes",
			"scan_status": media.ScanStatus,
		})
		return
	}

	if media.ThumbnailURL == nil || *media.ThumbnailURL == "" {
		RespondError(c, http.StatusNotFound, "Thumbnail not available")
		return
	}

	c.Header("Cache-Control", "private, max-age=300")
	c.Redirect(http.StatusTemporaryRedirect, *media.ThumbnailURL)
}

// BatchUploadMedia uploads multiple media files at once.
// @Summary      Batch upload media
// @Tags         Media
// @Security     BearerAuth
// @Accept       multipart/form-data
// @Produce      json
// @Success      200  {array}   models.MediaFile
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /media/batch-upload [post]
func (h *MediaHandler) BatchUploadMedia(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	// Parse multipart form
	if err := c.Request.ParseMultipartForm(maxBatchUploadSize); err != nil {
		RespondError(c, http.StatusBadRequest, "Failed to parse form")
		return
	}

	files := c.Request.MultipartForm.File["files"]
	if len(files) == 0 {
		RespondError(c, http.StatusBadRequest, "No files provided")
		return
	}
	if len(files) > maxBatchFiles {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":     "Too many files in one request",
			"max_files": maxBatchFiles,
		})
		return
	}

	usedBytes, err := h.mediaRepo.GetTrackedStorageByUserID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to evaluate storage quota")
		return
	}
	capBytes := resolveStorageCapForRole(c.GetString("role"), h.quota)
	var incomingTotal int64
	for _, f := range files {
		if f.Size > 0 {
			incomingTotal += f.Size
		}
	}
	if usedBytes+incomingTotal > capBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{
			"error":            "Storage quota exceeded",
			"storage_used":     usedBytes,
			"incoming_size":    incomingTotal,
			"storage_quota":    capBytes,
			"storage_quota_gb": capBytes / (1024 * 1024 * 1024),
		})
		return
	}

	// Process files concurrently
	type uploadResult struct {
		media *models.MediaFile
		err   error
		index int
	}

	resultsChan := make(chan uploadResult, len(files))

	for i, fileHeader := range files {
		go func(idx int, header *multipart.FileHeader) {
			media, err := h.processSingleUpload(c.Request.Context(), userID, c.GetString("role"), header)
			resultsChan <- uploadResult{media: media, err: err, index: idx}
		}(i, fileHeader)
	}

	// Collect results
	results := make([]*models.MediaFile, len(files))
	var errs []string
	successCount := 0

	for i := 0; i < len(files); i++ {
		result := <-resultsChan
		if result.err != nil {
			// Log the full error server-side; return only a generic message to
			// the client to avoid leaking internal paths or OS error details.
			zlog.Warn().Err(result.err).Int("file_index", result.index).Int("user_id", userID).Msg("batch upload: file processing failed")
			errs = append(errs, fmt.Sprintf("File %d: upload failed", result.index))
		} else {
			results[result.index] = result.media
			successCount++
		}
	}

	// Return response with successful uploads and any errors
	response := gin.H{
		"uploads":       results,
		"success_count": successCount,
		"total_count":   len(files),
	}

	if len(errs) > 0 {
		response["errors"] = errs
	}

	c.JSON(http.StatusOK, response)
}

// processSingleUpload handles uploading a single file (used by batch upload)
func (h *MediaHandler) processSingleUpload(ctx context.Context, userID int, role string, header *multipart.FileHeader) (*models.MediaFile, error) {
	// Check file size
	if header.Size > maxUploadSize {
		return nil, fmt.Errorf("file too large: %d bytes (max: %d)", header.Size, maxUploadSize)
	}
	if header.Size <= 0 {
		return nil, fmt.Errorf("empty file is not allowed")
	}

	file, err := header.Open()
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	uploadDir := "uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		return nil, fmt.Errorf("failed to prepare storage directory: %w", err)
	}

	safeName := filepath.Base(header.Filename)
	if !middleware.ValidateFileExtension(safeName) {
		return nil, fmt.Errorf("unsupported file extension")
	}
	newName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
	storagePath := filepath.Join(uploadDir, newName)

	dst, err := os.Create(storagePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create file: %w", err)
	}
	defer dst.Close()

	// Read and detect content type
	var sniff [512]byte
	n, _ := io.ReadFull(file, sniff[:])
	contentType := header.Header.Get("Content-Type")
	if detected := http.DetectContentType(sniff[:n]); detected != "" {
		contentType = detected
	}
	contentType = middleware.NormalizeDetectedMIME(safeName, contentType)

	// Validate MIME type (P0-008 Security Audit)
	if !middleware.ValidateMIMEType(contentType, middleware.AllowedMediaTypes) {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("file type not allowed: %s", contentType)
	}
	if !middleware.ValidateNoSuspiciousSignatures(sniff[:n], contentType) {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("file contains suspicious embedded signatures")
	}
	if !middleware.ValidateExtensionMatchesMIME(safeName, contentType) {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("file extension does not match detected content type")
	}

	// Validate file size for MIME type
	maxSizeForType := middleware.GetMaxSizeForMIME(contentType)
	if header.Size > maxSizeForType {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("file too large for type %s: %d bytes (max: %d)", contentType, header.Size, maxSizeForType)
	}

	// Write file — limit reader so a lying Content-Length cannot write beyond maxUploadSize.
	if n > 0 {
		if _, err := dst.Write(sniff[:n]); err != nil {
			_ = os.Remove(storagePath)
			return nil, fmt.Errorf("failed to save file: %w", err)
		}
	}

	// Re-use the already-consumed sniff bytes: remaining = maxUploadSize - n already read.
	writtenRest, err := io.Copy(dst, io.LimitReader(file, maxUploadSize-int64(n)+1))
	if err != nil {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("failed to save file: %w", err)
	}
	totalWritten := int64(n) + writtenRest
	if totalWritten > maxUploadSize {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("file too large: %d bytes (max: %d)", totalWritten, maxUploadSize)
	}

	if err := middleware.ValidateStrictDocumentStructure(storagePath, safeName, contentType, sniff[:n]); err != nil {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("invalid document structure: %w", err)
	}

	batchStorageURL := "/uploads/" + newName
	if h.storageService != nil {
		uploadFile, openErr := os.Open(storagePath)
		if openErr != nil {
			_ = os.Remove(storagePath)
			return nil, fmt.Errorf("failed to open file for storage upload: %w", openErr)
		}
		uploadedURL, uploadErr := h.storageService.Upload(ctx, newName, uploadFile, contentType)
		uploadFile.Close()
		if uploadErr != nil {
			_ = os.Remove(storagePath)
			return nil, fmt.Errorf("failed to upload file to storage backend: %w", uploadErr)
		}
		batchStorageURL = uploadedURL
		if h.storageBackend == "s3" {
			_ = os.Remove(storagePath)
		}
	}

	// Use the actual on-disk size — header.Size is client-controlled and cannot
	// be trusted for quota accounting.
	actualInfo, statErr := os.Stat(storagePath)
	actualSize := header.Size // fallback if stat fails (should not happen)
	if statErr == nil {
		actualSize = actualInfo.Size()
	}

	media := &models.MediaFile{
		UserID:           userID,
		Filename:         newName,
		OriginalFilename: safeName,
		FileType:         contentType,
		FileSize:         actualSize,
		StorageURL:       batchStorageURL,
		StoragePath:      storagePath,
	}

	// Extract dimensions for images (thumbnail generation is async when queue is available)
	if services.IsImageType(contentType) {
		width, height, err := h.thumbnailService.GetImageDimensions(storagePath)
		if err == nil {
			if width > maxImageDimension || height > maxImageDimension {
				_ = os.Remove(storagePath)
				return nil, fmt.Errorf("image dimensions exceed limit: %dx%d (max %dx%d)", width, height, maxImageDimension, maxImageDimension)
			}
			media.Width = &width
			media.Height = &height
		}
	}

	// Authoritative quota check using actual bytes written and a fresh DB read.
	// This prevents concurrent batch requests from racing past the pre-check.
	currentUsed, quotaErr := h.mediaRepo.GetTrackedStorageByUserID(ctx, userID)
	if quotaErr == nil {
		capBytes := resolveStorageCapForRole(role, h.quota)
		if currentUsed+media.FileSize > capBytes {
			_ = os.Remove(storagePath)
			return nil, fmt.Errorf("storage quota exceeded")
		}
	}

	if err := h.mediaRepo.Create(ctx, media); err != nil {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("failed to save media record: %w", err)
	}

	if err := h.schedulePostUploadJobs(ctx, media); err != nil {
		_ = os.Remove(storagePath)
		if deleteErr := h.mediaRepo.DeleteByID(ctx, media.ID); deleteErr != nil {
			zlog.Warn().Err(deleteErr).Int("media_id", media.ID).Msg("failed to rollback media record after scan enqueue failure")
		}
		return nil, fmt.Errorf("security scan unavailable: %w", err)
	}

	return media, nil
}

func (h *MediaHandler) schedulePostUploadJobs(ctx context.Context, media *models.MediaFile) error {
	if h.queueClient != nil {
		if err := h.queueClient.EnqueueVirusScan(ctx, media.ID, media.StoragePath, media.Filename, media.UserID); err != nil {
			zlog.Warn().Err(err).Int("media_id", media.ID).Msg("failed to enqueue virus scan")
			if markErr := h.mediaRepo.MarkScanError(ctx, media.ID, "virus scan queue unavailable"); markErr != nil {
				zlog.Warn().Err(markErr).Int("media_id", media.ID).Msg("failed to mark media scan error")
			}
			if h.virusScanFailClosed {
				return err
			}
		}

		return nil
	}

	if markErr := h.mediaRepo.MarkScanError(ctx, media.ID, "virus scan queue unavailable"); markErr != nil {
		zlog.Warn().Err(markErr).Int("media_id", media.ID).Msg("failed to mark media scan error")
	}
	if h.virusScanFailClosed {
		return fmt.Errorf("virus scan queue unavailable")
	}

	if !services.IsImageType(media.FileType) {
		return nil
	}

	h.generateAndStoreThumbnail(ctx, media)
	return nil
}

func (h *MediaHandler) generateAndStoreThumbnail(ctx context.Context, media *models.MediaFile) {
	var thumbnailPath string
	if services.IsImageType(media.FileType) {
		thumbSet, err := h.thumbnailService.GenerateImageThumbnails(media.StoragePath)
		if err != nil {
			zlog.Warn().Err(err).Int("media_id", media.ID).Msg("failed to generate thumbnail")
			return
		}
		thumbnailPath = thumbSet.PrimaryPath
	} else {
		var err error
		thumbnailPath, err = h.thumbnailService.GenerateThumbnail(media.StoragePath)
		if err != nil {
			zlog.Warn().Err(err).Int("media_id", media.ID).Msg("failed to generate thumbnail")
			return
		}
	}

	thumbnailName := filepath.Base(thumbnailPath)
	thumbnailURL := "/uploads/" + thumbnailName
	if err := h.mediaRepo.UpdateThumbnailURL(ctx, media.ID, thumbnailURL); err != nil {
		zlog.Warn().Err(err).Int("media_id", media.ID).Msg("failed to persist thumbnail URL")
		return
	}

	media.ThumbnailURL = &thumbnailURL
}

func resolveStorageCapForRole(role string, quota MediaQuotaConfig) int64 {
	switch role {
	case "admin", "moderator":
		return quota.ProTierBytes
	default:
		return quota.FreeTierBytes
	}
}

// presignedURLRequest is the request body for POST /api/v1/media/presigned-url.
type presignedURLRequest struct {
	Filename       string `json:"filename" binding:"required"`
	ContentType    string `json:"content_type" binding:"required"`
	FileSize       int64  `json:"file_size" binding:"required,min=1"`
	ChecksumSHA256 string `json:"checksum_sha256" binding:"required"`
}

// presignedURLResponse is the response body for POST /api/v1/media/presigned-url.
type presignedURLResponse struct {
	UploadID        uuid.UUID         `json:"upload_id"`
	UploadURL       string            `json:"upload_url"`
	RequiredHeaders map[string]string `json:"required_headers"`
	ExpiresIn       int               `json:"expires_in"` // seconds
}

// GetPresignedURL generates a presigned PUT URL for direct S3 uploads.
// Only available with S3 plus a separate private staging bucket.
//
// @Summary      Get S3 presigned upload URL
// @Description  Reserves quota and returns a constrained PUT URL for a private staging bucket.
// @Description  The caller must confirm with upload_id; only clean scans are promoted to public storage.
// @Tags         Media
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      presignedURLRequest   true  "Upload metadata"
// @Success      200   {object}  presignedURLResponse
// @Failure      400   {object}  gin.H  "Invalid request or file size out of range"
// @Failure      401   {object}  gin.H
// @Failure      413   {object}  gin.H  "File size exceeds maximum allowed"
// @Failure      415   {object}  gin.H  "Unsupported content type"
// @Failure      501   {object}  gin.H  "Private S3 staging bucket not configured"
// @Router       /media/presigned-url [post]
func (h *MediaHandler) GetPresignedURL(c *gin.Context) {
	if h.storageBackend != "s3" || h.s3Service == nil || h.uploadIntents == nil || !h.s3Service.SupportsQuarantinedDirectUploads() {
		RespondError(c, http.StatusNotImplemented, "quarantined direct uploads require S3_STAGING_BUCKET")
		return
	}

	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req presignedURLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		zlog.Debug().Err(err).Msg("invalid request body")
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	allowedPresignTypes := map[string]bool{
		"video/mp4":       true,
		"video/webm":      true,
		"video/quicktime": true,
		"image/jpeg":      true,
		"image/png":       true,
		"image/gif":       true,
		"image/webp":      true,
		"audio/mpeg":      true,
		"audio/wav":       true,
		"audio/ogg":       true,
	}
	if !allowedPresignTypes[req.ContentType] {
		RespondError(c, http.StatusUnsupportedMediaType, "Unsupported content type")
		return
	}

	// SEC-2: Validate file size (1 byte minimum, 100 MB maximum).
	const maxPresignedFileSize = 100 * 1024 * 1024 // 100MB
	if req.FileSize <= 0 || req.FileSize > maxPresignedFileSize {
		RespondError(c, http.StatusBadRequest, "file_size must be between 1 and 104857600 bytes")
		return
	}
	if maxForType := middleware.GetMaxSizeForMIME(req.ContentType); req.FileSize > maxForType {
		RespondError(c, http.StatusRequestEntityTooLarge, "file_size exceeds the limit for this content type")
		return
	}
	checksum, err := base64.StdEncoding.Strict().DecodeString(req.ChecksumSHA256)
	if err != nil || len(checksum) != 32 {
		RespondError(c, http.StatusBadRequest, "checksum_sha256 must be a base64-encoded SHA-256 digest")
		return
	}

	// SEC-1: Sanitize filename to prevent path traversal.
	safeName := filepath.Base(req.Filename)
	safeName = presignSafeNameRe.ReplaceAllString(safeName, "_")
	if safeName == "" || safeName == "." {
		RespondError(c, http.StatusBadRequest, "Invalid filename")
		return
	}
	var contentTypeExtensions = map[string][]string{
		"image/jpeg":      {".jpg", ".jpeg"},
		"image/png":       {".png"},
		"image/gif":       {".gif"},
		"image/webp":      {".webp"},
		"video/mp4":       {".mp4"},
		"video/webm":      {".webm"},
		"video/quicktime": {".mov", ".qt"},
		"audio/mpeg":      {".mp3"},
		"audio/ogg":       {".ogg"},
		"audio/wav":       {".wav"},
	}
	ext := strings.ToLower(filepath.Ext(safeName))
	if allowedExts, ok := contentTypeExtensions[req.ContentType]; ok {
		validExt := false
		for _, allowed := range allowedExts {
			if ext == allowed {
				validExt = true
				break
			}
		}
		if !validExt {
			RespondError(c, http.StatusBadRequest, "file extension does not match content type")
			return
		}
	}

	uploadID := uuid.New()
	key := fmt.Sprintf("pending-uploads/%d/%s/%s", userID, uploadID.String(), safeName)
	intent := &models.MediaUploadIntent{
		ID: uploadID, UserID: userID, StoragePath: key, OriginalFilename: safeName,
		ContentType: req.ContentType, DeclaredSize: req.FileSize,
		ChecksumSHA256: req.ChecksumSHA256, ExpiresAt: time.Now().UTC().Add(presignTTL),
	}
	capBytes := resolveStorageCapForRole(c.GetString("role"), h.quota)
	if err := h.uploadIntents.ReserveUploadIntent(c.Request.Context(), intent, capBytes); err != nil {
		if errors.Is(err, models.ErrMediaQuotaExceeded) {
			RespondError(c, http.StatusRequestEntityTooLarge, "Storage quota exceeded")
			return
		}
		zlog.Error().Err(err).Int("user_id", userID).Msg("failed to reserve direct upload")
		RespondError(c, http.StatusInternalServerError, "Failed to reserve upload")
		return
	}

	zlog.Info().Int("user_id", userID).Str("key", key).Str("content_type", req.ContentType).Int64("file_size", req.FileSize).Int("expires_in", int(presignTTL.Seconds())).Msg("presigned upload URL issued")

	uploadURL, err := h.s3Service.GeneratePresignedPutURLWithConstraints(c.Request.Context(), key, req.ContentType, req.FileSize, req.ChecksumSHA256, presignTTL)
	if err != nil {
		_ = h.uploadIntents.MarkUploadIntentFailed(c.Request.Context(), uploadID, userID, "presign generation failed")
		zlog.Error().Err(err).Int("user_id", userID).Msg("presigned URL generation failed")
		RespondError(c, http.StatusInternalServerError, "Failed to generate upload URL")
		return
	}

	c.JSON(http.StatusOK, presignedURLResponse{
		UploadID: uploadID, UploadURL: uploadURL,
		RequiredHeaders: map[string]string{"Content-Type": req.ContentType, "x-amz-checksum-sha256": req.ChecksumSHA256},
		ExpiresIn:       int(presignTTL.Seconds()),
	})
}

// confirmUploadRequest is the request body for POST /api/v1/media/confirm-upload.
// The opaque upload ID is resolved to server-owned metadata; no object key,
// size, filename, or content type is accepted from the confirmation request.
type confirmUploadRequest struct {
	UploadID uuid.UUID `json:"upload_id" binding:"required"`
}

// confirmUploadResponse is the response body for POST /api/v1/media/confirm-upload.
type confirmUploadResponse struct {
	MediaID    int    `json:"media_id"`
	ScanStatus string `json:"scan_status"`
}

// ConfirmUpload records a completed S3 direct upload and updates the user's storage quota.
// The client calls this after successfully completing the S3 presigned PUT.
//
// @Summary      Confirm completed S3 upload
// @Description  Called after the client finishes the presigned PUT to S3. Records the upload
// @Description  in the database, updates storage quota, and queues a mandatory security scan.
// @Tags         Media
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      confirmUploadRequest   true  "Upload confirmation"
// @Success      200   {object}  confirmUploadResponse
// @Failure      400   {object}  gin.H  "Invalid, expired, or mismatched upload reservation"
// @Failure      401   {object}  gin.H
// @Failure      501   {object}  gin.H  "Private S3 staging bucket not configured"
// @Router       /media/confirm-upload [post]
func (h *MediaHandler) ConfirmUpload(c *gin.Context) {
	if h.storageBackend != "s3" || h.s3Service == nil || h.uploadIntents == nil || !h.s3Service.SupportsQuarantinedDirectUploads() {
		RespondError(c, http.StatusNotImplemented, "quarantined direct uploads require S3_STAGING_BUCKET")
		return
	}

	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req confirmUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		zlog.Debug().Err(err).Msg("invalid request body")
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	intent, err := h.uploadIntents.GetUploadIntentOwned(c.Request.Context(), req.UploadID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to validate upload")
		return
	}
	if intent == nil || intent.Status == "failed" || (intent.Status == "pending" && time.Now().UTC().After(intent.ExpiresAt)) {
		RespondError(c, http.StatusBadRequest, "Upload reservation is invalid or expired")
		return
	}
	if intent.Status == "confirmed" && intent.ConfirmedMediaID != nil {
		h.respondToConfirmedDirectUpload(c, intent, *intent.ConfirmedMediaID)
		return
	}
	metadataStorage, ok := h.storageService.(services.ObjectMetadataStorage)
	if !ok {
		RespondError(c, http.StatusServiceUnavailable, "Upload verification is unavailable")
		return
	}
	metadata, err := metadataStorage.GetObjectMetadata(c.Request.Context(), intent.StoragePath)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Could not verify uploaded object")
		return
	}
	valid := metadata.Size == intent.DeclaredSize && metadata.ContentType == intent.ContentType &&
		subtle.ConstantTimeCompare([]byte(metadata.ChecksumSHA256), []byte(intent.ChecksumSHA256)) == 1
	if !valid {
		_ = h.storageService.Delete(c.Request.Context(), intent.StoragePath)
		_ = h.uploadIntents.MarkUploadIntentFailed(c.Request.Context(), intent.ID, userID, "uploaded object metadata mismatch")
		RespondError(c, http.StatusBadRequest, "Uploaded object does not match its signed reservation")
		return
	}
	capBytes := resolveStorageCapForRole(c.GetString("role"), h.quota)
	// The staged object intentionally has no public URL. The scan worker copies
	// clean objects into uploads/ and atomically publishes their serving URL.
	mediaID, replay, err := h.uploadIntents.FinalizeUploadIntent(c.Request.Context(), intent.ID, userID, metadata.Size, capBytes, "")
	if err != nil {
		if errors.Is(err, models.ErrMediaQuotaExceeded) {
			RespondError(c, http.StatusRequestEntityTooLarge, "Storage quota exceeded")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to record upload")
		return
	}
	if replay {
		h.respondToConfirmedDirectUpload(c, intent, mediaID)
		return
	}
	if h.queueClient == nil {
		_ = h.uploadIntents.RollbackConfirmedUpload(c.Request.Context(), intent.ID, userID, "security scan queue unavailable")
		_ = h.storageService.Delete(c.Request.Context(), intent.StoragePath)
		RespondError(c, http.StatusServiceUnavailable, "Security scan is unavailable")
		return
	}
	if err := h.queueClient.EnqueueVirusScan(c.Request.Context(), mediaID, intent.StoragePath, intent.StoragePath, userID); err != nil {
		_ = h.uploadIntents.RollbackConfirmedUpload(c.Request.Context(), intent.ID, userID, "security scan enqueue failed")
		_ = h.storageService.Delete(c.Request.Context(), intent.StoragePath)
		RespondError(c, http.StatusServiceUnavailable, "Security scan is unavailable")
		return
	}
	c.JSON(http.StatusAccepted, confirmUploadResponse{MediaID: mediaID, ScanStatus: models.MediaScanStatusPending})
}

func (h *MediaHandler) respondToConfirmedDirectUpload(c *gin.Context, intent *models.MediaUploadIntent, mediaID int) {
	media, err := h.mediaRepo.GetByID(c.Request.Context(), mediaID)
	if err != nil || media == nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load confirmed upload")
		return
	}
	if media.ScanStatus == models.MediaScanStatusClean {
		c.JSON(http.StatusOK, confirmUploadResponse{MediaID: mediaID, ScanStatus: media.ScanStatus})
		return
	}
	if media.ScanStatus == models.MediaScanStatusInfected {
		RespondError(c, http.StatusUnprocessableEntity, "Upload was rejected by security scanning")
		return
	}
	if h.queueClient == nil {
		RespondError(c, http.StatusServiceUnavailable, "Security scan is unavailable")
		return
	}
	if err := h.queueClient.EnqueueVirusScan(c.Request.Context(), mediaID, media.StoragePath, media.StoragePath, intent.UserID); err != nil {
		RespondError(c, http.StatusServiceUnavailable, "Security scan is unavailable")
		return
	}
	c.JSON(http.StatusAccepted, confirmUploadResponse{MediaID: mediaID, ScanStatus: media.ScanStatus})
}

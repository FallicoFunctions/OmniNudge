package handlers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/services"
)

const (
	maxUploadSize      = 100 * 1024 * 1024 // 100MB hard cap (largest allowed class: video)
	maxBatchUploadSize = 250 * 1024 * 1024 // 250MB total multipart body limit for batch uploads
	maxBatchFiles      = 10
	maxImageDimension  = 8000
)

type MediaQuotaConfig struct {
	FreeTierBytes int64
	ProTierBytes  int64
}

// MediaHandler handles media uploads
type MediaHandler struct {
	mediaRepo           *models.MediaFileRepository
	thumbnailService    *services.ThumbnailService
	queueClient         *queue.QueueClient
	quota               MediaQuotaConfig
	virusScanFailClosed bool
}

// NewMediaHandler creates a new media handler
func NewMediaHandler(
	mediaRepo *models.MediaFileRepository,
	thumbnailService *services.ThumbnailService,
	queueClient *queue.QueueClient,
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
	}
}

// UploadMedia handles POST /api/v1/media/upload
func (h *MediaHandler) UploadMedia(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Enforce max body size early
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadSize+1024)

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File is required", "details": err.Error()})
		return
	}
	defer file.Close()
	if header.Size <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Empty file is not allowed"})
		return
	}

	usedBytes, err := h.mediaRepo.GetTrackedStorageByUserID(c.Request.Context(), userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to evaluate storage quota", "details": err.Error()})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare storage directory", "details": err.Error()})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create file", "details": err.Error()})
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
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file", "details": err.Error()})
			return
		}
	}

	written, err := io.Copy(dst, limited)
	total += written
	if err != nil {
		_ = os.Remove(storagePath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file", "details": err.Error()})
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

	if err := middleware.ValidateStrictDocumentStructure(storagePath, safeName, contentType, sniff[:n]); err != nil {
		_ = os.Remove(storagePath)
		c.JSON(http.StatusUnsupportedMediaType, gin.H{
			"error":   "Invalid document structure",
			"name":    safeName,
			"type":    contentType,
			"details": err.Error(),
		})
		return
	}

	var usedInMessageID *int
	if val := c.PostForm("used_in_message_id"); val != "" {
		if id, err := strconv.Atoi(val); err == nil {
			usedInMessageID = &id
		}
	}

	media := &models.MediaFile{
		UserID:           userID.(int),
		Filename:         newName,
		OriginalFilename: safeName,
		FileType:         contentType,
		FileSize:         total,
		StorageURL:       "/uploads/" + newName,
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save media record", "details": err.Error()})
		return
	}

	if err := h.schedulePostUploadJobs(c.Request.Context(), media); err != nil {
		_ = os.Remove(storagePath)
		if deleteErr := h.mediaRepo.DeleteByID(c.Request.Context(), media.ID); deleteErr != nil {
			log.Printf("failed to rollback media record %d after scan enqueue failure: %v", media.ID, deleteErr)
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "Upload temporarily unavailable while security scanning is offline",
		})
		return
	}

	c.JSON(http.StatusCreated, media)
}

// GetThumbnail handles GET /api/v1/files/:id/thumbnail
// Returns a redirect to the thumbnail URL when available.
func (h *MediaHandler) GetThumbnail(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	role := c.GetString("role")

	mediaID, err := strconv.Atoi(c.Param("id"))
	if err != nil || mediaID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid media ID"})
		return
	}

	media, err := h.mediaRepo.GetByID(c.Request.Context(), mediaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Media file not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch media file", "details": err.Error()})
		return
	}

	if media.UserID != userID.(int) && role != "admin" && role != "moderator" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
		return
	}

	switch media.ScanStatus {
	case models.MediaScanStatusClean:
	case models.MediaScanStatusInfected:
		c.JSON(http.StatusGone, gin.H{"error": "File is unavailable"})
		return
	default:
		c.JSON(http.StatusLocked, gin.H{
			"error":       "File is not available until security scan completes",
			"scan_status": media.ScanStatus,
		})
		return
	}

	if media.ThumbnailURL == nil || *media.ThumbnailURL == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "Thumbnail not available"})
		return
	}

	c.Header("Cache-Control", "private, max-age=300")
	c.Redirect(http.StatusTemporaryRedirect, *media.ThumbnailURL)
}

// BatchUploadMedia handles POST /api/v1/media/batch-upload
func (h *MediaHandler) BatchUploadMedia(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse multipart form
	if err := c.Request.ParseMultipartForm(maxBatchUploadSize); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form", "details": err.Error()})
		return
	}

	files := c.Request.MultipartForm.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No files provided"})
		return
	}
	if len(files) > maxBatchFiles {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":     "Too many files in one request",
			"max_files": maxBatchFiles,
		})
		return
	}

	usedBytes, err := h.mediaRepo.GetTrackedStorageByUserID(c.Request.Context(), userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to evaluate storage quota", "details": err.Error()})
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
			media, err := h.processSingleUpload(c.Request.Context(), userID.(int), header)
			resultsChan <- uploadResult{media: media, err: err, index: idx}
		}(i, fileHeader)
	}

	// Collect results
	results := make([]*models.MediaFile, len(files))
	var errors []string
	successCount := 0

	for i := 0; i < len(files); i++ {
		result := <-resultsChan
		if result.err != nil {
			errors = append(errors, fmt.Sprintf("File %d: %v", result.index, result.err))
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

	if len(errors) > 0 {
		response["errors"] = errors
	}

	c.JSON(http.StatusOK, response)
}

// processSingleUpload handles uploading a single file (used by batch upload)
func (h *MediaHandler) processSingleUpload(ctx context.Context, userID int, header *multipart.FileHeader) (*models.MediaFile, error) {
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

	// Write file
	if n > 0 {
		if _, err := dst.Write(sniff[:n]); err != nil {
			_ = os.Remove(storagePath)
			return nil, fmt.Errorf("failed to save file: %w", err)
		}
	}

	if _, err := io.Copy(dst, file); err != nil {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("failed to save file: %w", err)
	}

	if err := middleware.ValidateStrictDocumentStructure(storagePath, safeName, contentType, sniff[:n]); err != nil {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("invalid document structure: %w", err)
	}

	media := &models.MediaFile{
		UserID:           userID,
		Filename:         newName,
		OriginalFilename: safeName,
		FileType:         contentType,
		FileSize:         header.Size,
		StorageURL:       "/uploads/" + newName,
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

	if err := h.mediaRepo.Create(ctx, media); err != nil {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("failed to save media record: %w", err)
	}

	if err := h.schedulePostUploadJobs(ctx, media); err != nil {
		_ = os.Remove(storagePath)
		if deleteErr := h.mediaRepo.DeleteByID(ctx, media.ID); deleteErr != nil {
			log.Printf("failed to rollback media record %d after scan enqueue failure: %v", media.ID, deleteErr)
		}
		return nil, fmt.Errorf("security scan unavailable: %w", err)
	}

	return media, nil
}

func (h *MediaHandler) schedulePostUploadJobs(ctx context.Context, media *models.MediaFile) error {
	if h.queueClient != nil {
		if err := h.queueClient.EnqueueVirusScan(ctx, media.ID, media.StoragePath, "", media.UserID); err != nil {
			log.Printf("failed to enqueue virus scan for media %d: %v", media.ID, err)
			if markErr := h.mediaRepo.MarkScanError(ctx, media.ID, "virus scan queue unavailable"); markErr != nil {
				log.Printf("failed to mark media %d scan error: %v", media.ID, markErr)
			}
			if h.virusScanFailClosed {
				return err
			}
		}

		if services.IsImageType(media.FileType) || services.IsPDFType(media.FileType) || services.IsVideoType(media.FileType) {
			thumbnailType := "image"
			if services.IsPDFType(media.FileType) {
				thumbnailType = "pdf"
			} else if services.IsVideoType(media.FileType) {
				thumbnailType = "video"
			}
			if err := h.queueClient.EnqueueThumbnailGeneration(ctx, media.ID, media.StorageURL, thumbnailType); err != nil {
				log.Printf("failed to enqueue thumbnail generation for media %d: %v", media.ID, err)
				if services.IsImageType(media.FileType) {
					h.generateAndStoreThumbnail(ctx, media)
				}
			}
		}

		return nil
	}

	if markErr := h.mediaRepo.MarkScanError(ctx, media.ID, "virus scan queue unavailable"); markErr != nil {
		log.Printf("failed to mark media %d scan error: %v", media.ID, markErr)
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
	thumbnailPath, err := h.thumbnailService.GenerateThumbnail(media.StoragePath)
	if err != nil {
		log.Printf("failed to generate thumbnail for media %d: %v", media.ID, err)
		return
	}

	thumbnailName := filepath.Base(thumbnailPath)
	thumbnailURL := "/uploads/" + thumbnailName
	if err := h.mediaRepo.UpdateThumbnailURL(ctx, media.ID, thumbnailURL); err != nil {
		log.Printf("failed to persist thumbnail URL for media %d: %v", media.ID, err)
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

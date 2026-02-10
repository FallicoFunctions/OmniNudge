package handlers

import (
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/gin-gonic/gin"
)

const (
	maxUploadSize = 25 * 1024 * 1024 // 25MB hard cap
)

// MediaHandler handles media uploads
type MediaHandler struct {
	mediaRepo        *models.MediaFileRepository
	thumbnailService *services.ThumbnailService
}

// NewMediaHandler creates a new media handler
func NewMediaHandler(mediaRepo *models.MediaFileRepository, thumbnailService *services.ThumbnailService) *MediaHandler {
	return &MediaHandler{
		mediaRepo:        mediaRepo,
		thumbnailService: thumbnailService,
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

	uploadDir := "uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare storage directory", "details": err.Error()})
		return
	}

	safeName := filepath.Base(header.Filename)
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

	// Validate MIME type (P0-008 Security Audit)
	if !middleware.ValidateMIMEType(contentType, middleware.AllowedMediaTypes) {
		_ = os.Remove(storagePath)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "File type not allowed",
			"type":  contentType,
			"allowed": []string{
				"Images: JPEG, PNG, GIF, WebP",
				"Audio: MP3, M4A, OGG, WAV, WebM, Opus",
				"Video: MP4, WebM, MOV, MKV",
			},
		})
		return
	}

	// Validate file size for MIME type
	maxSizeForType := middleware.GetMaxSizeForMIME(contentType)
	if total > maxSizeForType {
		_ = os.Remove(storagePath)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":    "File too large for this type",
			"type":     contentType,
			"size":     total,
			"max_size": maxSizeForType,
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large", "max_bytes": maxUploadSize})
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

	// Generate thumbnail and extract dimensions for images
	if services.IsImageType(contentType) {
		// Get image dimensions
		width, height, err := h.thumbnailService.GetImageDimensions(storagePath)
		if err == nil {
			media.Width = &width
			media.Height = &height
		}

		// Generate thumbnail
		thumbnailPath, err := h.thumbnailService.GenerateThumbnail(storagePath)
		if err == nil {
			// Convert absolute path to URL path
			thumbnailName := filepath.Base(thumbnailPath)
			thumbnailURL := "/uploads/" + thumbnailName
			media.ThumbnailURL = &thumbnailURL
		}
	}

	if err := h.mediaRepo.Create(c.Request.Context(), media); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save media record", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, media)
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
	if err := c.Request.ParseMultipartForm(maxUploadSize * 20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form", "details": err.Error()})
		return
	}

	files := c.Request.MultipartForm.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No files provided"})
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

	// Validate MIME type (P0-008 Security Audit)
	if !middleware.ValidateMIMEType(contentType, middleware.AllowedMediaTypes) {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("file type not allowed: %s", contentType)
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

	media := &models.MediaFile{
		UserID:           userID,
		Filename:         newName,
		OriginalFilename: safeName,
		FileType:         contentType,
		FileSize:         header.Size,
		StorageURL:       "/uploads/" + newName,
		StoragePath:      storagePath,
	}

	// Generate thumbnail and extract dimensions for images
	if services.IsImageType(contentType) {
		// Get image dimensions
		width, height, err := h.thumbnailService.GetImageDimensions(storagePath)
		if err == nil {
			media.Width = &width
			media.Height = &height
		}

		// Generate thumbnail
		thumbnailPath, err := h.thumbnailService.GenerateThumbnail(storagePath)
		if err == nil {
			thumbnailName := filepath.Base(thumbnailPath)
			thumbnailURL := "/uploads/" + thumbnailName
			media.ThumbnailURL = &thumbnailURL
		}
	}

	if err := h.mediaRepo.Create(ctx, media); err != nil {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("failed to save media record: %w", err)
	}

	return media, nil
}

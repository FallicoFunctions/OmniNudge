package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/chatreddit/backend/internal/models"
	"github.com/chatreddit/backend/internal/services"
	"github.com/gin-gonic/gin"
)

const (
	maxUploadSize = 25 * 1024 * 1024 // 25MB hard cap
)

var allowedContentTypes = map[string]bool{
	"image/jpeg":       true,
	"image/png":        true,
	"image/webp":       true,
	"image/gif":        true,
	"video/mp4":        true,
	"video/quicktime":  true,
	"video/webm":       true,
}

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
	if !allowedContentTypes[contentType] {
		_ = os.Remove(storagePath)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported file type", "content_type": contentType})
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

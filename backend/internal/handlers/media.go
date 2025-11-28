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
	"github.com/gin-gonic/gin"
)

// MediaHandler handles media uploads
type MediaHandler struct {
	mediaRepo *models.MediaFileRepository
}

// NewMediaHandler creates a new media handler
func NewMediaHandler(mediaRepo *models.MediaFileRepository) *MediaHandler {
	return &MediaHandler{mediaRepo: mediaRepo}
}

// UploadMedia handles POST /api/v1/media/upload
func (h *MediaHandler) UploadMedia(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

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

	if _, err := io.Copy(dst, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file", "details": err.Error()})
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
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
		FileSize:         header.Size,
		StorageURL:       "/uploads/" + newName,
		StoragePath:      storagePath,
		UsedInMessageID:  usedInMessageID,
	}

	if err := h.mediaRepo.Create(c.Request.Context(), media); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save media record", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, media)
}

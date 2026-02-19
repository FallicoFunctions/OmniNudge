package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
)

type UploadsHandler struct {
	mediaRepo   *models.MediaFileRepository
	uploadsRoot string
}

func NewUploadsHandler(mediaRepo *models.MediaFileRepository, uploadsRoot string) *UploadsHandler {
	if uploadsRoot == "" {
		uploadsRoot = "./uploads"
	}
	return &UploadsHandler{
		mediaRepo:   mediaRepo,
		uploadsRoot: uploadsRoot,
	}
}

// ServeUpload serves upload assets and blocks media files that are not scan-clean.
func (h *UploadsHandler) ServeUpload(c *gin.Context) {
	cleanRelPath, ok := cleanUploadPath(c.Param("filepath"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file path"})
		return
	}
	publicURL := "/uploads/" + filepath.ToSlash(cleanRelPath)
	allowUntracked := isUntrackedUploadPathAllowed(cleanRelPath)

	if h.mediaRepo != nil {
		media, err := h.mediaRepo.GetByPublicURL(c.Request.Context(), publicURL)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate media access"})
			return
		}
		if media == nil {
			if !allowUntracked {
				c.Status(http.StatusNotFound)
				return
			}
		} else {
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
		}
	} else if !allowUntracked {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Upload access validation unavailable"})
		return
	}

	absRoot, err := filepath.Abs(h.uploadsRoot)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve upload root"})
		return
	}
	absFile, err := filepath.Abs(filepath.Join(absRoot, filepath.FromSlash(cleanRelPath)))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file path"})
		return
	}
	if !strings.HasPrefix(absFile, absRoot+string(filepath.Separator)) && absFile != absRoot {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file path"})
		return
	}

	info, err := os.Stat(absFile)
	if err != nil || info.IsDir() {
		c.Status(http.StatusNotFound)
		return
	}

	c.File(absFile)
}

func cleanUploadPath(rawPath string) (string, bool) {
	trimmed := strings.TrimPrefix(rawPath, "/")
	if trimmed == "" || strings.Contains(trimmed, "\x00") {
		return "", false
	}
	cleaned := filepath.Clean(trimmed)
	if cleaned == "." || strings.HasPrefix(cleaned, "..") {
		return "", false
	}
	return cleaned, true
}

func isUntrackedUploadPathAllowed(cleanRelPath string) bool {
	return strings.HasPrefix(cleanRelPath, "avatars/") || strings.HasPrefix(cleanRelPath, "exports/")
}

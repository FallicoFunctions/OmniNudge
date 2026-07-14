package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
)

type UploadsHandler struct {
	mediaRepo   ports.MediaFileRepository
	uploadsRoot string
}

func NewUploadsHandler(mediaRepo ports.MediaFileRepository, uploadsRoot string) *UploadsHandler {
	if uploadsRoot == "" {
		uploadsRoot = "./uploads"
	}
	return &UploadsHandler{
		mediaRepo:   mediaRepo,
		uploadsRoot: uploadsRoot,
	}
}

// ServeUpload serves upload assets and blocks media files that are not scan-clean.
// @Summary      Serve uploaded file
// @Tags         Uploads
// @Produce      application/octet-stream
// @Param        filepath  path      string  true  "File path"
// @Success      200       {file}    binary
// @Failure      400       {object}  gin.H
// @Failure      404       {object}  gin.H
// @Failure      423       {object}  gin.H
// @Failure      410       {object}  gin.H
// @Router       /uploads/{filepath} [get]
func (h *UploadsHandler) ServeUpload(c *gin.Context) {
	cleanRelPath, ok := cleanUploadPath(c.Param("filepath"))
	if !ok {
		RespondError(c, http.StatusBadRequest, "Invalid file path")
		return
	}
	publicURL := "/uploads/" + filepath.ToSlash(cleanRelPath)
	allowUntracked := isUntrackedUploadPathAllowed(cleanRelPath)
	storagePath := filepath.ToSlash(filepath.Join("uploads", cleanRelPath))

	if h.mediaRepo != nil {
		media, err := h.mediaRepo.GetByPublicURL(c.Request.Context(), publicURL)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to validate media access")
			return
		}
		if media == nil {
			derivedURL, ok := deriveTrackedMediaURL(publicURL)
			if ok {
				media, err = h.mediaRepo.GetByPublicURL(c.Request.Context(), derivedURL)
				if err != nil {
					RespondError(c, http.StatusInternalServerError, "Failed to validate media access")
					return
				}
			}
		}
		if media == nil {
			media, err = h.mediaRepo.FindByStoragePath(c.Request.Context(), storagePath)
			if err != nil {
				RespondError(c, http.StatusInternalServerError, "Failed to validate media access")
				return
			}
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
				RespondError(c, http.StatusGone, "File is unavailable")
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
		RespondError(c, http.StatusServiceUnavailable, "Upload access validation unavailable")
		return
	}

	absRoot, err := filepath.Abs(h.uploadsRoot)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to resolve upload root")
		return
	}
	absFile, err := filepath.Abs(filepath.Join(absRoot, filepath.FromSlash(cleanRelPath)))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid file path")
		return
	}
	if !strings.HasPrefix(absFile, absRoot+string(filepath.Separator)) && absFile != absRoot {
		RespondError(c, http.StatusBadRequest, "Invalid file path")
		return
	}

	info, err := os.Stat(absFile)
	if err != nil || info.IsDir() {
		if h.mediaRepo != nil {
			media, lookupErr := h.mediaRepo.FindByStoragePath(c.Request.Context(), storagePath)
			if lookupErr != nil {
				RespondError(c, http.StatusInternalServerError, "Failed to validate media access")
				return
			}
			if media != nil && (media.ScanStatus == models.MediaScanStatusClean) && strings.HasPrefix(media.StorageURL, "http") {
				c.Redirect(http.StatusTemporaryRedirect, media.StorageURL)
				return
			}
		}
		c.Status(http.StatusNotFound)
		return
	}

	if isThumbnailPath(cleanRelPath) {
		// Thumbnails are immutable assets generated from immutable upload names.
		c.Header("Cache-Control", "public, max-age=2592000")
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
	return strings.HasPrefix(cleanRelPath, "avatars/") ||
		strings.HasPrefix(cleanRelPath, "banners/") ||
		strings.HasPrefix(cleanRelPath, "voice/")
}

func isThumbnailPath(cleanRelPath string) bool {
	base := strings.ToLower(filepath.Base(cleanRelPath))
	return strings.Contains(base, "_thumb") || strings.Contains(base, "_pdfthumb")
}

func deriveTrackedMediaURL(publicURL string) (string, bool) {
	// Secondary generated image thumbnails (_thumb_sm) are authorization-linked
	// to the corresponding tracked primary thumbnail (_thumb).
	if !strings.Contains(publicURL, "_thumb_sm") {
		return "", false
	}
	return strings.Replace(publicURL, "_thumb_sm", "_thumb", 1), true
}

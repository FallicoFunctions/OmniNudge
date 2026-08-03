package handlers

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/services"
)

// trackedMediaAccessAuthorizer is intentionally separate from the broad media
// repository port. Deployments that cannot authoritatively check access must
// fail closed for tracked objects instead of treating storage URLs as bearer
// credentials.
type trackedMediaAccessAuthorizer interface {
	CanUserAccessMedia(context.Context, int, int) (bool, error)
}

type publicTrackedMediaAuthorizer interface {
	IsMediaPubliclyAccessible(context.Context, int) (bool, error)
}

type UploadsHandler struct {
	mediaRepo   ports.MediaFileRepository
	uploadsRoot string
	storage     services.StorageService
}

func NewUploadsHandler(mediaRepo ports.MediaFileRepository, uploadsRoot string, storageServices ...services.StorageService) *UploadsHandler {
	if uploadsRoot == "" {
		uploadsRoot = "./uploads"
	}
	var storage services.StorageService
	if len(storageServices) > 0 {
		storage = storageServices[0]
	}
	return &UploadsHandler{
		mediaRepo:   mediaRepo,
		uploadsRoot: uploadsRoot,
		storage:     storage,
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
	// The global static-asset middleware treats /uploads as public. Override it
	// before every early return so an anonymous miss cannot poison a shared
	// cache for an authorized viewer, and so private thumbnails never become
	// public merely because their filename contains "_thumb".
	c.Header("Cache-Control", "private, no-store")

	cleanRelPath, ok := cleanUploadPath(c.Param("filepath"))
	if !ok {
		RespondError(c, http.StatusBadRequest, "Invalid file path")
		return
	}
	publicURL := "/uploads/" + filepath.ToSlash(cleanRelPath)
	allowUntracked := isUntrackedUploadPathAllowed(cleanRelPath)
	storagePath := filepath.ToSlash(filepath.Join("uploads", cleanRelPath))
	publicUntrackedAsset := false

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
			publicUntrackedAsset = true
		} else {
			userID, authenticated := c.Get("user_id")
			requesterID, validUserID := userID.(int)
			authorizer, supportsAuthorization := h.mediaRepo.(trackedMediaAccessAuthorizer)
			allowed := false
			var accessErr error
			if authenticated && validUserID && requesterID > 0 && supportsAuthorization {
				allowed, accessErr = authorizer.CanUserAccessMedia(c.Request.Context(), media.ID, requesterID)
			} else if publicAuthorizer, publicOK := h.mediaRepo.(publicTrackedMediaAuthorizer); publicOK {
				allowed, accessErr = publicAuthorizer.IsMediaPubliclyAccessible(c.Request.Context(), media.ID)
			}
			if accessErr != nil {
				RespondError(c, http.StatusInternalServerError, "Failed to validate media access")
				return
			}
			if !allowed {
				c.Status(http.StatusNotFound)
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
		}
	} else if !allowUntracked {
		RespondError(c, http.StatusServiceUnavailable, "Upload access validation unavailable")
		return
	} else {
		publicUntrackedAsset = true
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
			if media != nil && media.ScanStatus == models.MediaScanStatusClean {
				if h.serveRemoteTrackedMedia(c, media) {
					return
				}
				return
			}
		}
		c.Status(http.StatusNotFound)
		return
	}

	if publicUntrackedAsset {
		// Public profile assets use immutable names and may be shared-cached.
		c.Header("Cache-Control", "public, max-age=604800, immutable")
		c.Writer.Header().Del("Pragma")
		c.Writer.Header().Del("Expires")
	}
	c.File(absFile)
}

// serveRemoteTrackedMedia proxies an authorized remote object instead of
// redirecting a browser to its CloudFront/S3 URL. A storage URL must never be
// a public bearer credential for a private conversation attachment.
func (h *UploadsHandler) serveRemoteTrackedMedia(c *gin.Context, media *models.MediaFile) bool {
	if h.storage == nil {
		RespondError(c, http.StatusServiceUnavailable, "Media storage is unavailable")
		return true
	}
	key := strings.TrimSpace(media.StorageObjectKey)
	if key == "" {
		// Rows written before storage_object_key was introduced are safe only
		// when the legacy path is an uploads-relative key.
		key = strings.TrimPrefix(filepath.ToSlash(media.StoragePath), "uploads/")
	}
	if key == "" || strings.HasPrefix(key, "/") || strings.Contains(key, "..") {
		RespondError(c, http.StatusNotFound, "Media not found")
		return true
	}
	objectSize, err := h.storage.GetObjectSize(c.Request.Context(), key)
	if err != nil || objectSize <= 0 || objectSize != media.FileSize || objectSize > maxUploadSize {
		RespondError(c, http.StatusNotFound, "Media not found")
		return true
	}
	reader, err := h.storage.Download(c.Request.Context(), key)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Media not found")
		return true
	}
	defer reader.Close()
	c.Header("Content-Type", media.FileType)
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename=%q`, safeUploadResponseFilename(media.Filename)))
	c.Header("Content-Length", strconv.FormatInt(objectSize, 10))
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	_, _ = io.Copy(c.Writer, &io.LimitedReader{R: reader, N: objectSize})
	return true
}

func safeUploadResponseFilename(filename string) string {
	filename = strings.ReplaceAll(filepath.Base(filename), `"`, "")
	if filename == "" || filename == "." {
		return "media"
	}
	return filename
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
		strings.HasPrefix(cleanRelPath, "banners/")
}

func deriveTrackedMediaURL(publicURL string) (string, bool) {
	// Secondary generated image thumbnails (_thumb_sm) are authorization-linked
	// to the corresponding tracked primary thumbnail (_thumb).
	if !strings.Contains(publicURL, "_thumb_sm") {
		return "", false
	}
	return strings.Replace(publicURL, "_thumb_sm", "_thumb", 1), true
}

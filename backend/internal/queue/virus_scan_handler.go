package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/services"
)

// NewVirusScanHandler scans uploaded files and stores scan state in media_files.
// storageSvc is optional; when provided it is used to download files from R2/S3
// when the local copy has already been removed after upload.
func NewVirusScanHandler(
	mediaRepo ports.MediaFileRepository,
	scanner services.VirusScanner,
	failClosed bool,
	storageSvc services.StorageService,
	thumbnailJobs ThumbnailGenerationEnqueuer,
) JobHandler {
	type storageLocationUpdater interface {
		UpdateStorageLocation(context.Context, int, string, string) error
	}
	return func(ctx context.Context, task *asynq.Task) error {
		if mediaRepo == nil {
			return fmt.Errorf("virus scan misconfigured: media repository is nil")
		}

		var payload VirusScanPayload
		if err := json.Unmarshal(task.Payload(), &payload); err != nil {
			return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
		}
		if payload.FileID <= 0 {
			return fmt.Errorf("invalid file_id=%d: %w", payload.FileID, asynq.SkipRetry)
		}

		if scanner == nil {
			errMsg := "virus scanner is not configured"
			if markErr := mediaRepo.MarkScanError(ctx, payload.FileID, errMsg); markErr != nil {
				log.Printf("failed to mark media %d scan error: %v", payload.FileID, markErr)
			}
			if failClosed {
				return fmt.Errorf("%s", errMsg)
			}
			log.Printf("virus scan skipped (fail-open): file_id=%d", payload.FileID)
			return nil
		}

		media, err := mediaRepo.GetByID(ctx, payload.FileID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("media file_id=%d no longer exists: %w", payload.FileID, asynq.SkipRetry)
			}
			return fmt.Errorf("failed to load media %d for scan: %w", payload.FileID, err)
		}
		if media == nil {
			return fmt.Errorf("media file_id=%d no longer exists: %w", payload.FileID, asynq.SkipRetry)
		}

		remoteKey := resolveMediaRemoteKey(media.Filename, payload.S3Key)
		if strings.HasPrefix(payload.S3Key, "pending-uploads/") && strings.HasPrefix(media.StoragePath, "uploads/") {
			// A duplicate/retried scan task may outlive promotion of the staged
			// object. Follow the repository's authoritative published location.
			remoteKey = media.StoragePath
		}
		scanPath, cleanup, err := resolveMediaSource(ctx, media.StoragePath, remoteKey, storageSvc)
		if err != nil {
			errMsg := fmt.Sprintf("failed to prepare source for scan: %v", err)
			if markErr := mediaRepo.MarkScanError(ctx, payload.FileID, errMsg); markErr != nil {
				log.Printf("failed to mark media %d scan error: %v", payload.FileID, markErr)
			}
			if failClosed {
				return fmt.Errorf("%s", errMsg)
			}
			log.Printf("virus scan skipped (fail-open): file_id=%d err=%v", payload.FileID, err)
			return nil
		}
		defer cleanup()
		if strings.HasPrefix(media.StoragePath, "pending-uploads/") {
			if validationErr := validateStagedUpload(scanPath, media); validationErr != nil {
				if storageSvc != nil {
					if deleteErr := storageSvc.Delete(ctx, media.StoragePath); deleteErr != nil {
						return fmt.Errorf("delete invalid staged media %d: %w", media.ID, deleteErr)
					}
				}
				reason := "content validation failed: " + validationErr.Error()
				if markErr := mediaRepo.MarkScanInfected(ctx, media.ID, reason); markErr != nil {
					return fmt.Errorf("mark invalid staged media %d: %w", media.ID, markErr)
				}
				return fmt.Errorf("staged media validation failed for file_id=%d: %w", media.ID, asynq.SkipRetry)
			}
		}

		result, err := scanner.ScanFile(ctx, scanPath)
		if err != nil {
			errMsg := err.Error()
			if markErr := mediaRepo.MarkScanError(ctx, payload.FileID, errMsg); markErr != nil {
				log.Printf("failed to mark media %d scan error: %v", payload.FileID, markErr)
			}
			if failClosed {
				return fmt.Errorf("virus scan failed for file_id=%d: %w", payload.FileID, err)
			}
			log.Printf("virus scan failed but allowed (fail-open): file_id=%d err=%v", payload.FileID, err)
			return nil
		}

		if result.Infected {
			// Remove every copy before publishing the infected state. A remote
			// deletion error remains retryable so malware is never orphaned in the
			// backing bucket.
			if removeErr := os.Remove(media.StoragePath); removeErr != nil && !os.IsNotExist(removeErr) {
				log.Printf("failed to remove infected media file %d at %s: %v", payload.FileID, media.StoragePath, removeErr)
			}
			if storageSvc != nil {
				remoteKey := resolveMediaRemoteKey(media.Filename, payload.S3Key)
				if remoteKey != "" {
					if deleteErr := storageSvc.Delete(ctx, remoteKey); deleteErr != nil {
						return fmt.Errorf("failed to delete infected remote media %d: %w", payload.FileID, deleteErr)
					}
				}
			}

			reason := "malware detected"
			if result.Signature != "" {
				reason = fmt.Sprintf("malware detected: %s", result.Signature)
			}
			if markErr := mediaRepo.MarkScanInfected(ctx, payload.FileID, reason); markErr != nil {
				return fmt.Errorf("failed to mark media %d infected: %w", payload.FileID, markErr)
			}
			return fmt.Errorf("virus detected in file_id=%d: %w", payload.FileID, asynq.SkipRetry)
		}

		thumbnailSourceKey := resolveMediaRemoteKey(media.Filename, payload.S3Key)
		if strings.HasPrefix(media.StoragePath, "pending-uploads/") {
			copier, copyOK := storageSvc.(services.ObjectCopyStorage)
			updater, updateOK := mediaRepo.(storageLocationUpdater)
			if !copyOK || !updateOK {
				return fmt.Errorf("direct-upload promotion is unavailable for media %d", media.ID)
			}
			destinationKey := "uploads/" + strings.TrimPrefix(media.StoragePath, "pending-uploads/")
			publicURL, copyErr := copier.CopyObject(ctx, media.StoragePath, destinationKey)
			if copyErr != nil {
				return fmt.Errorf("promote scanned media %d: %w", media.ID, copyErr)
			}
			if updateErr := updater.UpdateStorageLocation(ctx, media.ID, destinationKey, publicURL); updateErr != nil {
				return fmt.Errorf("publish scanned media %d: %w", media.ID, updateErr)
			}
			if deleteErr := storageSvc.Delete(ctx, media.StoragePath); deleteErr != nil {
				log.Printf("failed to remove staged copy for clean media %d: %v", media.ID, deleteErr)
			}
			media.StoragePath = destinationKey
			media.StorageURL = publicURL
			thumbnailSourceKey = destinationKey
		}

		if err := mediaRepo.MarkScanClean(ctx, payload.FileID); err != nil {
			return fmt.Errorf("failed to mark media %d clean: %w", payload.FileID, err)
		}

		if thumbnailJobs != nil {
			if thumbnailType, ok := thumbnailJobTypeForMIME(media.FileType); ok {
				if err := thumbnailJobs.EnqueueThumbnailGeneration(ctx, media.ID, media.StorageURL, thumbnailSourceKey, thumbnailType); err != nil {
					return fmt.Errorf("failed to enqueue thumbnail generation for media %d: %w", media.ID, err)
				}
			}
		}

		log.Printf("Virus scan passed: file_id=%d", payload.FileID)
		return nil
	}
}

func validateStagedUpload(path string, media *models.MediaFile) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	var head [512]byte
	n, readErr := file.Read(head[:])
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		return readErr
	}
	detected := middleware.NormalizeDetectedMIME(media.OriginalFilename, http.DetectContentType(head[:n]))
	if strings.EqualFold(media.FileType, "video/quicktime") && detected == "video/mp4" &&
		(strings.EqualFold(filepath.Ext(media.OriginalFilename), ".mov") || strings.EqualFold(filepath.Ext(media.OriginalFilename), ".qt")) {
		detected = "video/quicktime"
	}
	if !middleware.ValidateMIMEType(detected, middleware.AllowedMediaTypes) {
		return fmt.Errorf("detected MIME %q is not allowed", detected)
	}
	if detected != strings.ToLower(strings.TrimSpace(media.FileType)) {
		return fmt.Errorf("detected MIME %q does not match declared MIME %q", detected, media.FileType)
	}
	if !middleware.ValidateExtensionMatchesMIME(media.OriginalFilename, detected) {
		return fmt.Errorf("filename extension does not match detected MIME")
	}
	if !middleware.ValidateNoSuspiciousSignatures(head[:n], detected) {
		return fmt.Errorf("suspicious embedded signature")
	}
	if services.IsImageType(detected) {
		width, height, err := services.NewThumbnailService().GetImageDimensions(path)
		if err != nil {
			return fmt.Errorf("invalid image structure: %w", err)
		}
		if width <= 0 || height <= 0 || width > 8000 || height > 8000 {
			return fmt.Errorf("image dimensions %dx%d are outside allowed limits", width, height)
		}
	}
	return nil
}

package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
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

		scanPath, cleanup, err := resolveMediaSource(ctx, media.StoragePath, resolveMediaRemoteKey(media.Filename, payload.S3Key), storageSvc)
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
			// Remove local copy if it still exists; R2 deletion is handled separately via quarantine flow.
			if removeErr := os.Remove(media.StoragePath); removeErr != nil && !os.IsNotExist(removeErr) {
				log.Printf("failed to remove infected media file %d at %s: %v", payload.FileID, media.StoragePath, removeErr)
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

		if err := mediaRepo.MarkScanClean(ctx, payload.FileID); err != nil {
			return fmt.Errorf("failed to mark media %d clean: %w", payload.FileID, err)
		}

		if thumbnailJobs != nil {
			if thumbnailType, ok := thumbnailJobTypeForMIME(media.FileType); ok {
				if err := thumbnailJobs.EnqueueThumbnailGeneration(ctx, media.ID, media.StorageURL, resolveMediaRemoteKey(media.Filename, payload.S3Key), thumbnailType); err != nil {
					return fmt.Errorf("failed to enqueue thumbnail generation for media %d: %w", media.ID, err)
				}
			}
		}

		log.Printf("Virus scan passed: file_id=%d", payload.FileID)
		return nil
	}
}

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
func NewVirusScanHandler(mediaRepo ports.MediaFileRepository, scanner services.VirusScanner, failClosed bool) JobHandler {
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
		if payload.FilePath == "" {
			return fmt.Errorf("missing file_path for file_id=%d: %w", payload.FileID, asynq.SkipRetry)
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

		_, err = os.Stat(media.StoragePath)
		if err != nil {
			errMsg := fmt.Sprintf("file not found at %s", media.StoragePath)
			if markErr := mediaRepo.MarkScanError(ctx, payload.FileID, errMsg); markErr != nil {
				log.Printf("failed to mark media %d scan error: %v", payload.FileID, markErr)
			}
			if failClosed {
				return fmt.Errorf("failed to open file for scanning: %w: %w", err, asynq.SkipRetry)
			}
			return nil
		}

		result, err := scanner.ScanFile(ctx, media.StoragePath)
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
			if err := os.Remove(media.StoragePath); err != nil && !os.IsNotExist(err) {
				log.Printf("failed to remove infected media file %d at %s: %v", payload.FileID, media.StoragePath, err)
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

		log.Printf("Virus scan passed: file_id=%d", payload.FileID)
		return nil
	}
}

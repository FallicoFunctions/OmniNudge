package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
func NewVirusScanHandler(mediaRepo ports.MediaFileRepository, scanner services.VirusScanner, failClosed bool, storageSvc services.StorageService) JobHandler {
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

		// Resolve the path to scan. When the local file was removed after S3 upload,
		// download a temporary copy from storage so ClamAV can scan it.
		scanPath := media.StoragePath
		var tempFile *os.File

		if _, statErr := os.Stat(scanPath); os.IsNotExist(statErr) {
			s3Key := payload.S3Key
			if s3Key == "" {
				s3Key = media.Filename
			}

			if storageSvc == nil {
				errMsg := "local file missing and no storage service configured for remote scan"
				if markErr := mediaRepo.MarkScanError(ctx, payload.FileID, errMsg); markErr != nil {
					log.Printf("failed to mark media %d scan error: %v", payload.FileID, markErr)
				}
				if failClosed {
					return fmt.Errorf("%s: %w", errMsg, asynq.SkipRetry)
				}
				log.Printf("virus scan skipped (fail-open): file_id=%d local missing, no storage svc", payload.FileID)
				return nil
			}

			rc, downloadErr := storageSvc.Download(ctx, s3Key)
			if downloadErr != nil {
				errMsg := fmt.Sprintf("failed to download from storage for scan: %v", downloadErr)
				if markErr := mediaRepo.MarkScanError(ctx, payload.FileID, errMsg); markErr != nil {
					log.Printf("failed to mark media %d scan error: %v", payload.FileID, markErr)
				}
				if failClosed {
					return fmt.Errorf("%s", errMsg)
				}
				return nil
			}
			defer rc.Close()

			tempFile, err = os.CreateTemp("", "omniscan-*")
			if err != nil {
				return fmt.Errorf("failed to create temp file for scan: %w", err)
			}
			defer func() {
				tempFile.Close()
				os.Remove(tempFile.Name())
			}()

			if _, err = io.Copy(tempFile, rc); err != nil {
				return fmt.Errorf("failed to write temp file for scan: %w", err)
			}
			if err = tempFile.Sync(); err != nil {
				return fmt.Errorf("failed to sync temp file for scan: %w", err)
			}
			scanPath = tempFile.Name()
			log.Printf("virus scan: downloaded s3 key=%q to temp file for file_id=%d", s3Key, payload.FileID)
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

		log.Printf("Virus scan passed: file_id=%d", payload.FileID)
		return nil
	}
}

package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"time"

	"github.com/hibiken/asynq"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// NewThumbnailGenerationHandler creates a real thumbnail generation handler.
func NewThumbnailGenerationHandler(
	mediaRepo *models.MediaFileRepository,
	thumbnailService *services.ThumbnailService,
) JobHandler {
	return func(ctx context.Context, task *asynq.Task) error {
		var payload ThumbnailGenerationPayload
		if err := json.Unmarshal(task.Payload(), &payload); err != nil {
			return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
		}
		if payload.FileID <= 0 {
			return fmt.Errorf("invalid file_id=%d: %w", payload.FileID, asynq.SkipRetry)
		}
		if mediaRepo == nil || thumbnailService == nil {
			return fmt.Errorf("thumbnail handler dependencies not configured: %w", asynq.SkipRetry)
		}

		media, err := mediaRepo.GetByID(ctx, payload.FileID)
		if err != nil {
			return fmt.Errorf("failed to load media %d: %w", payload.FileID, err)
		}
		switch media.ScanStatus {
		case models.MediaScanStatusClean:
			// proceed
		case models.MediaScanStatusPending:
			return fmt.Errorf("media %d scan pending; defer thumbnail generation", media.ID)
		case models.MediaScanStatusInfected:
			return fmt.Errorf("media %d infected; skipping thumbnail generation: %w", media.ID, asynq.SkipRetry)
		case models.MediaScanStatusError:
			return fmt.Errorf("media %d scan error; skipping thumbnail generation: %w", media.ID, asynq.SkipRetry)
		default:
			return fmt.Errorf("media %d unknown scan status %q; skipping thumbnail generation: %w", media.ID, media.ScanStatus, asynq.SkipRetry)
		}
		var thumbnailPath string
		var thumbnailErr error
		switch {
		case services.IsImageType(media.FileType):
			thumbnailPath, thumbnailErr = thumbnailService.GenerateThumbnail(media.StoragePath)
		case services.IsVideoType(media.FileType):
			thumbnailPath, thumbnailErr = thumbnailService.GenerateVideoThumbnailSecure(media.StoragePath, 30*time.Second)
		case services.IsPDFType(media.FileType):
			thumbnailPath, thumbnailErr = thumbnailService.GeneratePDFThumbnailSecure(media.StoragePath, 30*time.Second)
		default:
			log.Printf("Skipping thumbnail generation for unsupported media %d (%s)", media.ID, media.FileType)
			return nil
		}
		if thumbnailErr != nil {
			return fmt.Errorf("failed to generate thumbnail for media %d: %w", media.ID, thumbnailErr)
		}
		thumbnailName := filepath.Base(thumbnailPath)
		thumbnailURL := "/uploads/" + thumbnailName

		if err := mediaRepo.UpdateThumbnailURL(ctx, media.ID, thumbnailURL); err != nil {
			return fmt.Errorf("failed to persist thumbnail URL for media %d: %w", media.ID, err)
		}

		log.Printf("Thumbnail generated for media %d: %s", media.ID, thumbnailURL)
		return nil
	}
}

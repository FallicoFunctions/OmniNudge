package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// MediaFileRepository defines the interface for media file persistence operations.
type MediaFileRepository interface {
	Create(ctx context.Context, media *domain.MediaFile) error
	GetByStorageURL(ctx context.Context, storageURL string) (*domain.MediaFile, error)
	GetByID(ctx context.Context, id int) (*domain.MediaFile, error)
	GetTotalStorageByUserID(ctx context.Context, userID int) (int64, error)
	GetTrackedStorageByUserID(ctx context.Context, userID int) (int64, error)
	UpdateThumbnailURL(ctx context.Context, mediaID int, thumbnailURL string) error
	DeleteByID(ctx context.Context, mediaID int) error
	GetByPublicURL(ctx context.Context, publicURL string) (*domain.MediaFile, error)
	MarkScanClean(ctx context.Context, mediaID int) error
	MarkScanError(ctx context.Context, mediaID int, scanErr string) error
	MarkScanInfected(ctx context.Context, mediaID int, reason string) error
}

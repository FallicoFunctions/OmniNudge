package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// RemovedContentRepository defines the interface for removed content persistence operations.
type RemovedContentRepository interface {
	RemoveContent(ctx context.Context, contentType string, contentID int, hubID *int, removedBy int, removalReasonID *int, customReason, modNote string) (*domain.RemovedContent, error)
	RestoreContent(ctx context.Context, contentType string, contentID int) error
	IsContentRemoved(ctx context.Context, contentType string, contentID int) (bool, error)
	GetByContent(ctx context.Context, contentType string, contentID int) (*domain.RemovedContent, error)
	GetByHub(ctx context.Context, hubID int, limit, offset int) ([]*domain.RemovedContent, error)
}

package ports

import (
	"context"
	"time"

	"github.com/omninudge/backend/internal/domain"
)

// NotificationBatchRepository defines the interface for notification batch persistence operations.
type NotificationBatchRepository interface {
	Create(ctx context.Context, batch *domain.NotificationBatch) error
	GetPendingBatches(ctx context.Context, beforeTime time.Time) ([]*domain.NotificationBatch, error)
	MarkAsProcessed(ctx context.Context, batchID int) error
	CancelBatch(ctx context.Context, userID int, contentType string, contentID int) error
	CleanupOldBatches(ctx context.Context) error
}

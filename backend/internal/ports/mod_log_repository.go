package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// ModLogRepository defines the interface for mod log persistence operations.
type ModLogRepository interface {
	Log(ctx context.Context, hubID, moderatorID int, action, targetType string, targetID int, details domain.JSONB) (*domain.ModLog, error)
	GetByHub(ctx context.Context, hubID int, limit, offset int) ([]*domain.ModLog, error)
	GetByHubWithCursor(ctx context.Context, hubID int, limit int, cursor *domain.TimeCursor) ([]*domain.ModLog, error)
	GetByModerator(ctx context.Context, moderatorID int, limit, offset int) ([]*domain.ModLog, error)
	GetByAction(ctx context.Context, hubID int, action string, limit, offset int) ([]*domain.ModLog, error)
}

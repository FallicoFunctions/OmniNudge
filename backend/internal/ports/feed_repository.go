package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// FeedRepository defines persistence operations for the unified feed.
type FeedRepository interface {
	GetUnifiedFeed(ctx context.Context, sortBy string, limit, offset int, sourceFilter string) ([]*domain.UnifiedFeedItem, error)
}

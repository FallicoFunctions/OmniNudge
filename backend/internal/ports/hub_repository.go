package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// HubRepository defines persistence operations for hubs.
type HubRepository interface {
	Create(ctx context.Context, h *domain.Hub) error
	GetByName(ctx context.Context, name string) (*domain.Hub, error)
	GetByID(ctx context.Context, id int) (*domain.Hub, error)
	List(ctx context.Context, limit, offset int, includeNsfw bool) ([]*domain.Hub, error)
	ListAgentTargets(ctx context.Context) ([]*domain.HubTarget, error)
	ListByPrefix(ctx context.Context, prefix string, limit, offset int, includeNsfw bool) ([]*domain.Hub, error)
	UpsertHubTopicFilters(ctx context.Context, hubID int, denyKeywords []string) error
	GetPopularHubs(ctx context.Context, limit, offset int) ([]*domain.Hub, error)
	SearchHubs(ctx context.Context, query string, limit int) ([]*domain.Hub, error)
	GetTrendingHubs(ctx context.Context, limit int) ([]*domain.Hub, error)
	UpdateNSFW(ctx context.Context, hubID int, nsfw bool) error
}

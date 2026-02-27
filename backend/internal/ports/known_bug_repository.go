package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// KnownBugRepository defines the interface for known bug persistence operations.
type KnownBugRepository interface {
	GetAll(ctx context.Context, status *string) ([]*domain.KnownBug, error)
	Create(ctx context.Context, bug *domain.KnownBug) error
	Update(ctx context.Context, bug *domain.KnownBug) error
	Delete(ctx context.Context, id int) error
}

package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// UserBaselineRepository defines the persistence contract for user activity baselines.
type UserBaselineRepository interface {
	GetByUserID(ctx context.Context, userID int) (*domain.UserBaseline, error)
	CreateOrUpdate(ctx context.Context, baseline *domain.UserBaseline) error
	IsNewUser(ctx context.Context, userID int) (bool, error)
	GetExperienceLevel(ctx context.Context, userID int) (string, error)
	GetAllStaleBaselines(ctx context.Context) ([]*domain.UserBaseline, error)
}

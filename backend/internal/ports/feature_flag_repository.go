package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// FeatureFlagRepository defines persistence operations for feature flags.
type FeatureFlagRepository interface {
	GetFlag(ctx context.Context, key string) (*domain.FeatureFlag, error)
	ListFlags(ctx context.Context, environment string) ([]*domain.FeatureFlag, error)
	CreateFlag(ctx context.Context, flag *domain.FeatureFlag) error
	UpdateFlag(ctx context.Context, flag *domain.FeatureFlag) error
	DeleteFlag(ctx context.Context, key string) error
	GetUserOverride(ctx context.Context, key string, userID int64) (*bool, error)
	SetUserOverride(ctx context.Context, key string, userID int64, enabled bool) error
	RemoveUserOverride(ctx context.Context, key string, userID int64) error
	CreateAuditLog(ctx context.Context, audit *domain.FeatureFlagAudit) error
	GetAuditLog(ctx context.Context, key string, limit int) ([]*domain.FeatureFlagAudit, error)
	GetAnyUserID(ctx context.Context) (int64, error)
}

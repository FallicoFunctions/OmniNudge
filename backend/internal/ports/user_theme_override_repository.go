package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// UserThemeOverrideRepository defines persistence operations for user theme overrides.
type UserThemeOverrideRepository interface {
	SetOverride(ctx context.Context, userID int, pageName string, themeID int) (*domain.UserThemeOverride, error)
	GetOverride(ctx context.Context, userID int, pageName string) (*domain.UserThemeOverride, error)
	GetAllOverrides(ctx context.Context, userID int) ([]*domain.UserThemeOverride, error)
	DeleteOverride(ctx context.Context, userID int, pageName string) error
	DeleteAllOverrides(ctx context.Context, userID int) error
}

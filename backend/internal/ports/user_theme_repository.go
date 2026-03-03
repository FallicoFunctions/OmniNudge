package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// UserThemeRepository defines persistence operations for user themes.
type UserThemeRepository interface {
	Create(ctx context.Context, theme *domain.UserTheme) (*domain.UserTheme, error)
	GetByID(ctx context.Context, id int) (*domain.UserTheme, error)
	GetByUserID(ctx context.Context, userID int, limit, offset int) ([]*domain.UserTheme, error)
	GetByUserIDWithCursor(ctx context.Context, userID int, limit int, cursor *domain.TimeCursor) ([]*domain.UserTheme, error)
	GetPublicThemes(ctx context.Context, limit, offset int, category *string) ([]*domain.UserTheme, error)
	GetPublicThemesWithCursor(ctx context.Context, limit int, category *string, cursor *domain.ThemePublicCursor) ([]*domain.UserTheme, error)
	Update(ctx context.Context, theme *domain.UserTheme) error
	Delete(ctx context.Context, themeID, userID int) error
	GetPredefinedThemes(ctx context.Context) ([]*domain.UserTheme, error)
}

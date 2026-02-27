package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// UserInstalledThemeRepository defines persistence operations for user installed themes.
type UserInstalledThemeRepository interface {
	Install(ctx context.Context, userID, themeID, pricePaid int) (*domain.UserInstalledTheme, error)
	GetInstalledTheme(ctx context.Context, userID, themeID int) (*domain.UserInstalledTheme, error)
	GetUserInstalledThemes(ctx context.Context, userID int) ([]*domain.UserInstalledTheme, error)
	SetActive(ctx context.Context, userID, themeID int) error
	RateTheme(ctx context.Context, userID, themeID, rating int, review *string) error
	Uninstall(ctx context.Context, userID, themeID int) error
	HasInstalled(ctx context.Context, userID, themeID int) (bool, error)
	GetActiveTheme(ctx context.Context, userID int) (*domain.UserInstalledTheme, error)
}

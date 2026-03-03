package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// UserSettingsRepository defines the persistence contract for user settings.
type UserSettingsRepository interface {
	GetByUserID(ctx context.Context, userID int) (*domain.UserSettings, error)
	CreateDefault(ctx context.Context, userID int) (*domain.UserSettings, error)
	Update(ctx context.Context, settings *domain.UserSettings) (*domain.UserSettings, error)
}

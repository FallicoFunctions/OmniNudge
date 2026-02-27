package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// HubSettingsRepository defines the persistence contract for hub settings and moderation.
type HubSettingsRepository interface {
	GetHubIDByName(ctx context.Context, hubName string) (int, error)
	GetByHubID(ctx context.Context, hubID int) (*domain.HubSettings, error)
	EnsureDefaults(ctx context.Context, settings *domain.HubSettings, userID *int) error
	Update(ctx context.Context, settings *domain.HubSettings, userID int) error
	GetModeratorRole(ctx context.Context, hubID int, userID int) (*domain.ModeratorRole, error)
	GetHubModerators(ctx context.Context, hubID int) ([]domain.HubModerator, error)
	UpdateModeratorRole(ctx context.Context, hubID int, targetUserID int, newRole domain.ModeratorRole) error
	AddModerator(ctx context.Context, hubID int, userID int, role domain.ModeratorRole) error
	RemoveModerator(ctx context.Context, hubID int, userID int) error
	IsModerator(ctx context.Context, hubID, userID int) (bool, error)
}

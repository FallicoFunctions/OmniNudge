package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// HubModeratorRepository defines the persistence contract for hub moderators.
type HubModeratorRepository interface {
	AddModerator(ctx context.Context, hubID, userID int) error
	IsModerator(ctx context.Context, hubID, userID int) (bool, error)
	GetModeratorsForHub(ctx context.Context, hubID int) ([]domain.HubModeratorUser, error)
	GetHubsForModerator(ctx context.Context, userID int) ([]domain.ModeratedHubSummary, error)
	RemoveModerator(ctx context.Context, hubID, userID int) error
}

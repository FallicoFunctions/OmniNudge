package ports

import (
	"context"
	"time"

	"github.com/omninudge/backend/internal/domain"
)

// HubBanRepository defines the persistence contract for hub bans.
type HubBanRepository interface {
	BanUser(ctx context.Context, hubID, userID, bannedBy int, reason, note string, banType string, expiresAt *time.Time) (*domain.HubBan, error)
	UnbanUser(ctx context.Context, hubID, userID int) error
	IsUserBanned(ctx context.Context, hubID, userID int) (bool, error)
	GetBanByUser(ctx context.Context, hubID, userID int) (*domain.HubBan, error)
	GetBannedUsers(ctx context.Context, hubID int) ([]*domain.HubBan, error)
	CleanExpiredBans(ctx context.Context) (int64, error)
}

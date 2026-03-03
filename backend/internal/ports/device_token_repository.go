package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// DeviceTokenRepository defines persistence operations for push notification device tokens.
type DeviceTokenRepository interface {
	Upsert(ctx context.Context, dt *domain.DeviceToken) error
	DeleteByUserAndToken(ctx context.Context, userID int, token string) error
	GetByUserID(ctx context.Context, userID int) ([]*domain.DeviceToken, error)
	UpdateLastUsed(ctx context.Context, token string) error
}

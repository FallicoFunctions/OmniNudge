package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// UserProfileRepository defines persistence operations for user profiles.
type UserProfileRepository interface {
	GetByUserID(ctx context.Context, userID int) (*domain.UserProfile, error)
	Upsert(ctx context.Context, userID int, bio, avatarURL, statusText *string) error
}

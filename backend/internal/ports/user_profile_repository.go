package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// UserProfileRepository defines persistence operations for user profiles.
type UserProfileRepository interface {
	GetByUserID(ctx context.Context, userID int) (*domain.UserProfile, error)
	// GetWallVisibility returns just the wall_visibility setting, avoiding a full
	// profile load for access-control checks.
	GetWallVisibility(ctx context.Context, userID int) (string, error)
	Upsert(ctx context.Context, userID int, bio, avatarURL, statusText, bannerURL, topFriendsJSON, location *string) error
	// UpdateTopFriends atomically updates only top_friends_json, avoiding
	// the read-modify-write race present in Upsert when other fields are unchanged.
	UpdateTopFriends(ctx context.Context, userID int, topFriendsJSON *string) error
	// UpdateWallVisibility atomically updates only wall_visibility.
	UpdateWallVisibility(ctx context.Context, userID int, visibility string) error
}

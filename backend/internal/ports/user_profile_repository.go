package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// UserProfileRepository defines persistence operations for user profiles.
type UserProfileRepository interface {
	GetByUserID(ctx context.Context, userID int) (*domain.UserProfile, error)
	Upsert(ctx context.Context, userID int, bio, avatarURL, statusText, bannerURL, topFriendsJSON *string) error
	// UpdateTopFriends atomically updates only top_friends_json, avoiding
	// the read-modify-write race present in Upsert when other fields are unchanged.
	UpdateTopFriends(ctx context.Context, userID int, topFriendsJSON *string) error
}

package ports

import "context"

// UserFriendshipRepository defines persistence operations for user friendships.
type UserFriendshipRepository interface {
	AreUsersFriends(ctx context.Context, userID, otherUserID int) (bool, error)
	UpsertAccepted(ctx context.Context, userID, otherUserID int) error
}

package ports

import (
	"context"

	"github.com/omninudge/backend/internal/models"
)

// UserFriendshipRepository defines persistence operations for user friendships.
type UserFriendshipRepository interface {
	// Existing
	AreUsersFriends(ctx context.Context, userID, otherUserID int) (bool, error)
	UpsertAccepted(ctx context.Context, userID, otherUserID int) error

	// Friend requests
	GetFriendshipStatus(ctx context.Context, viewerID, otherID int) (*models.FriendshipStatus, error)
	SendRequest(ctx context.Context, requesterID, recipientID int) error
	AcceptRequest(ctx context.Context, acceptorID, requesterID int) error
	DeclineOrCancelRequest(ctx context.Context, userA, userB int) error
	RemoveFriend(ctx context.Context, userA, userB int) error

	// Listing
	ListFriends(ctx context.Context, userID int) ([]models.FriendEntry, error)
	CountFriends(ctx context.Context, userID int) (int, error)
	ListIncomingRequests(ctx context.Context, userID int) ([]models.FriendRequestEntry, error)
	ListOutgoingRequests(ctx context.Context, userID int) ([]models.FriendRequestEntry, error)
	GetMutualFriends(ctx context.Context, userID, otherUserID int, limit int) ([]models.MutualFriendEntry, error)
}

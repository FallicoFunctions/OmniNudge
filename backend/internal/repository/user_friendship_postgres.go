package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresUserFriendshipRepository adapts models.UserFriendshipRepository to ports.UserFriendshipRepository.
type PostgresUserFriendshipRepository struct {
	inner *models.UserFriendshipRepository
}

var _ ports.UserFriendshipRepository = (*PostgresUserFriendshipRepository)(nil)

func NewPostgresUserFriendshipRepository(pool *pgxpool.Pool) ports.UserFriendshipRepository {
	return &PostgresUserFriendshipRepository{inner: models.NewUserFriendshipRepository(pool)}
}

func (r *PostgresUserFriendshipRepository) AreUsersFriends(ctx context.Context, userID, otherUserID int) (bool, error) {
	return r.inner.AreUsersFriends(ctx, userID, otherUserID)
}

func (r *PostgresUserFriendshipRepository) UpsertAccepted(ctx context.Context, userID, otherUserID int) error {
	return r.inner.UpsertAccepted(ctx, userID, otherUserID)
}

func (r *PostgresUserFriendshipRepository) GetFriendshipStatus(ctx context.Context, viewerID, otherID int) (*models.FriendshipStatus, error) {
	return r.inner.GetFriendshipStatus(ctx, viewerID, otherID)
}

func (r *PostgresUserFriendshipRepository) SendRequest(ctx context.Context, requesterID, recipientID int) error {
	return r.inner.SendRequest(ctx, requesterID, recipientID)
}

func (r *PostgresUserFriendshipRepository) AcceptRequest(ctx context.Context, acceptorID, requesterID int) error {
	return r.inner.AcceptRequest(ctx, acceptorID, requesterID)
}

func (r *PostgresUserFriendshipRepository) DeclineOrCancelRequest(ctx context.Context, userA, userB int) error {
	return r.inner.DeclineOrCancelRequest(ctx, userA, userB)
}

func (r *PostgresUserFriendshipRepository) RemoveFriend(ctx context.Context, userA, userB int) error {
	return r.inner.RemoveFriend(ctx, userA, userB)
}

func (r *PostgresUserFriendshipRepository) ListFriends(ctx context.Context, userID int) ([]models.FriendEntry, error) {
	return r.inner.ListFriends(ctx, userID)
}

func (r *PostgresUserFriendshipRepository) ListIncomingRequests(ctx context.Context, userID int) ([]models.FriendRequestEntry, error) {
	return r.inner.ListIncomingRequests(ctx, userID)
}

func (r *PostgresUserFriendshipRepository) ListOutgoingRequests(ctx context.Context, userID int) ([]models.FriendRequestEntry, error) {
	return r.inner.ListOutgoingRequests(ctx, userID)
}

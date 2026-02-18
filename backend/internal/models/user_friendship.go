package models

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// UserFriendshipRepository handles user friendship lookups.
type UserFriendshipRepository struct {
	pool *pgxpool.Pool
}

// NewUserFriendshipRepository creates a new friendship repository.
func NewUserFriendshipRepository(pool *pgxpool.Pool) *UserFriendshipRepository {
	return &UserFriendshipRepository{pool: pool}
}

func canonicalFriendPair(a, b int) (int, int) {
	if a < b {
		return a, b
	}
	return b, a
}

// AreUsersFriends returns true when users have an accepted friendship.
func (r *UserFriendshipRepository) AreUsersFriends(ctx context.Context, userID, otherUserID int) (bool, error) {
	lo, hi := canonicalFriendPair(userID, otherUserID)
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM user_friendships
			WHERE user_id = $1
			  AND friend_user_id = $2
			  AND status = 'accepted'
		)
	`, lo, hi).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

// UpsertAccepted creates or updates an accepted friendship relation.
func (r *UserFriendshipRepository) UpsertAccepted(ctx context.Context, userID, otherUserID int) error {
	lo, hi := canonicalFriendPair(userID, otherUserID)
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_friendships (user_id, friend_user_id, status, created_at, updated_at)
		VALUES ($1, $2, 'accepted', NOW(), NOW())
		ON CONFLICT (user_id, friend_user_id)
		DO UPDATE SET status = 'accepted', updated_at = NOW()
	`, lo, hi)
	return err
}

package models

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
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

// CanonicalUserPair returns (lo, hi) such that lo <= hi, guaranteeing a stable
// canonical ordering for any (userA, userB) pair regardless of argument order.
// All friendship-table writes and the block-cleanup DELETE in BlockUser use this
// so both always address the same row.
func CanonicalUserPair(a, b int) (int, int) {
	if a < b {
		return a, b
	}
	return b, a
}

// FriendEntry is a single accepted friend in a list.
type FriendEntry struct {
	UserID    int       `json:"id"`
	Username  string    `json:"username"`
	AvatarURL *string   `json:"avatar_url"`
	FriendsSince time.Time `json:"friends_since"`
}

// FriendRequestEntry is a pending friend request (incoming or outgoing).
type FriendRequestEntry struct {
	UserID    int       `json:"id"`
	Username  string    `json:"username"`
	AvatarURL *string   `json:"avatar_url"`
	SentAt    time.Time `json:"sent_at"`
}

// FriendshipStatus describes the relationship between two users.
type FriendshipStatus struct {
	// Status is one of: "none", "pending_incoming", "pending_outgoing", "accepted"
	Status      string `json:"status"`
	RequesterID *int   `json:"-"`
}

// AreUsersFriends returns true when users have an accepted friendship.
func (r *UserFriendshipRepository) AreUsersFriends(ctx context.Context, userID, otherUserID int) (bool, error) {
	lo, hi := CanonicalUserPair(userID, otherUserID)
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

// GetFriendshipStatus returns the relationship status between two users from viewerID's perspective.
func (r *UserFriendshipRepository) GetFriendshipStatus(ctx context.Context, viewerID, otherID int) (*FriendshipStatus, error) {
	lo, hi := CanonicalUserPair(viewerID, otherID)
	var status string
	var requesterID *int
	err := r.pool.QueryRow(ctx, `
		SELECT status, requester_id
		FROM user_friendships
		WHERE user_id = $1 AND friend_user_id = $2
	`, lo, hi).Scan(&status, &requesterID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return &FriendshipStatus{Status: "none"}, nil
		}
		return nil, fmt.Errorf("GetFriendshipStatus: %w", err)
	}
	if status == "accepted" {
		return &FriendshipStatus{Status: "accepted", RequesterID: requesterID}, nil
	}
	// pending — figure out direction from requester_id.
	// NULL requester_id means direction is unknown (corrupt/legacy row); treat as none
	// rather than misrouting to pending_incoming, which would offer a false Accept button.
	if requesterID == nil {
		return &FriendshipStatus{Status: "none"}, nil
	}
	if *requesterID == viewerID {
		return &FriendshipStatus{Status: "pending_outgoing", RequesterID: requesterID}, nil
	}
	return &FriendshipStatus{Status: "pending_incoming", RequesterID: requesterID}, nil
}

// SendRequest creates a pending friend request from requesterID to recipientID.
// Uses ON CONFLICT DO NOTHING so concurrent double-sends are safe: if a row already
// exists (race between two tabs or a fast retry), ErrRequestAlreadyExists is returned
// instead of a raw DB constraint error.
func (r *UserFriendshipRepository) SendRequest(ctx context.Context, requesterID, recipientID int) error {
	lo, hi := CanonicalUserPair(requesterID, recipientID)
	result, err := r.pool.Exec(ctx, `
		INSERT INTO user_friendships (user_id, friend_user_id, status, requester_id, created_at, updated_at)
		VALUES ($1, $2, 'pending', $3, NOW(), NOW())
		ON CONFLICT (user_id, friend_user_id) DO NOTHING
	`, lo, hi, requesterID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrRequestAlreadyExists
	}
	return nil
}

// AcceptRequest accepts a pending friend request. The acceptorID must NOT be the original requester.
func (r *UserFriendshipRepository) AcceptRequest(ctx context.Context, acceptorID, requesterID int) error {
	lo, hi := CanonicalUserPair(acceptorID, requesterID)
	result, err := r.pool.Exec(ctx, `
		UPDATE user_friendships
		SET status = 'accepted', updated_at = NOW()
		WHERE user_id = $1
		  AND friend_user_id = $2
		  AND status = 'pending'
		  AND requester_id = $3
	`, lo, hi, requesterID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrFriendshipNotFound
	}
	return nil
}

// DeclineOrCancelRequest deletes a pending request (decline by recipient, cancel by sender).
func (r *UserFriendshipRepository) DeclineOrCancelRequest(ctx context.Context, userA, userB int) error {
	lo, hi := CanonicalUserPair(userA, userB)
	result, err := r.pool.Exec(ctx, `
		DELETE FROM user_friendships
		WHERE user_id = $1 AND friend_user_id = $2 AND status = 'pending'
	`, lo, hi)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrFriendshipNotFound
	}
	return nil
}

// RemoveFriend deletes an accepted friendship.
func (r *UserFriendshipRepository) RemoveFriend(ctx context.Context, userA, userB int) error {
	lo, hi := CanonicalUserPair(userA, userB)
	result, err := r.pool.Exec(ctx, `
		DELETE FROM user_friendships
		WHERE user_id = $1 AND friend_user_id = $2 AND status = 'accepted'
	`, lo, hi)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrFriendshipNotFound
	}
	return nil
}

// ListFriends returns all accepted friends for userID, ordered by username.
func (r *UserFriendshipRepository) ListFriends(ctx context.Context, userID int) ([]FriendEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT uf.friend_user_id AS friend_id, u.username, u.avatar_url, uf.updated_at
		FROM user_friendships uf
		JOIN users u ON u.id = uf.friend_user_id
		WHERE uf.user_id = $1 AND uf.status = 'accepted'
		UNION ALL
		SELECT uf.user_id AS friend_id, u.username, u.avatar_url, uf.updated_at
		FROM user_friendships uf
		JOIN users u ON u.id = uf.user_id
		WHERE uf.friend_user_id = $1 AND uf.status = 'accepted'
		ORDER BY username ASC
		LIMIT 200
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var friends []FriendEntry
	for rows.Next() {
		var f FriendEntry
		if err := rows.Scan(&f.UserID, &f.Username, &f.AvatarURL, &f.FriendsSince); err != nil {
			return nil, err
		}
		friends = append(friends, f)
	}
	return friends, rows.Err()
}

// ListIncomingRequests returns pending requests sent TO userID by others.
func (r *UserFriendshipRepository) ListIncomingRequests(ctx context.Context, userID int) ([]FriendRequestEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT uf.friend_user_id AS sender_id, u.username, u.avatar_url, uf.created_at
		FROM user_friendships uf
		JOIN users u ON u.id = uf.friend_user_id
		WHERE uf.user_id = $1
		  AND uf.status = 'pending'
		  AND uf.requester_id IS NOT NULL AND uf.requester_id != $1
		UNION ALL
		SELECT uf.user_id AS sender_id, u.username, u.avatar_url, uf.created_at
		FROM user_friendships uf
		JOIN users u ON u.id = uf.user_id
		WHERE uf.friend_user_id = $1
		  AND uf.status = 'pending'
		  AND uf.requester_id IS NOT NULL AND uf.requester_id != $1
		ORDER BY created_at DESC
		LIMIT 100
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []FriendRequestEntry
	for rows.Next() {
		var r FriendRequestEntry
		if err := rows.Scan(&r.UserID, &r.Username, &r.AvatarURL, &r.SentAt); err != nil {
			return nil, err
		}
		requests = append(requests, r)
	}
	return requests, rows.Err()
}

// ListOutgoingRequests returns pending requests sent BY userID to others.
func (r *UserFriendshipRepository) ListOutgoingRequests(ctx context.Context, userID int) ([]FriendRequestEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT uf.friend_user_id AS recipient_id, u.username, u.avatar_url, uf.created_at
		FROM user_friendships uf
		JOIN users u ON u.id = uf.friend_user_id
		WHERE uf.user_id = $1
		  AND uf.status = 'pending'
		  AND uf.requester_id = $1
		UNION ALL
		SELECT uf.user_id AS recipient_id, u.username, u.avatar_url, uf.created_at
		FROM user_friendships uf
		JOIN users u ON u.id = uf.user_id
		WHERE uf.friend_user_id = $1
		  AND uf.status = 'pending'
		  AND uf.requester_id = $1
		ORDER BY created_at DESC
		LIMIT 100
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []FriendRequestEntry
	for rows.Next() {
		var r FriendRequestEntry
		if err := rows.Scan(&r.UserID, &r.Username, &r.AvatarURL, &r.SentAt); err != nil {
			return nil, err
		}
		requests = append(requests, r)
	}
	return requests, rows.Err()
}

// UpsertAccepted creates or updates an accepted friendship relation.
func (r *UserFriendshipRepository) UpsertAccepted(ctx context.Context, userID, otherUserID int) error {
	lo, hi := CanonicalUserPair(userID, otherUserID)
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_friendships (user_id, friend_user_id, status, created_at, updated_at)
		VALUES ($1, $2, 'accepted', NOW(), NOW())
		ON CONFLICT (user_id, friend_user_id)
		DO UPDATE SET status = 'accepted', updated_at = NOW()
	`, lo, hi)
	return err
}

// ErrFriendshipNotFound is returned when no matching friendship row is found.
var ErrFriendshipNotFound = fmt.Errorf("friendship not found")

// ErrRequestAlreadyExists is returned when a friendship row already exists and the
// insert was a no-op (ON CONFLICT DO NOTHING). This makes concurrent double-sends safe.
var ErrRequestAlreadyExists = fmt.Errorf("friend request already exists")

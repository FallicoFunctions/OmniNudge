package models

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// IsBlockedBidirectional returns true when either userA has blocked userB or
// userB has blocked userA. All block-enforcement call sites should call this
// shared helper so the check stays consistent and the SQL lives in one place.
func IsBlockedBidirectional(ctx context.Context, pool *pgxpool.Pool, userA, userB int) (bool, error) {
	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM blocked_users
			WHERE (blocker_id = $1 AND blocked_id = $2)
			   OR (blocker_id = $2 AND blocked_id = $1)
		)
	`, userA, userB).Scan(&exists)
	return exists, err
}

// GetAllBlockedIDs returns all user IDs that have ANY block relationship with
// userID (whether userID blocked them or they blocked userID).
// Returns a []int suitable for direct use in SQL ANY($n) / ALL($n) bindings,
// and a map[int]struct{} for O(1) membership tests in Go.
func GetAllBlockedIDs(ctx context.Context, pool *pgxpool.Pool, userID int) ([]int, map[int]struct{}, error) {
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT
			CASE WHEN blocker_id = $1 THEN blocked_id ELSE blocker_id END
		FROM blocked_users
		WHERE blocker_id = $1 OR blocked_id = $1
	`, userID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var ids []int
	set := make(map[int]struct{})
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, nil, err
		}
		ids = append(ids, id)
		set[id] = struct{}{}
	}
	return ids, set, rows.Err()
}

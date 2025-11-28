package models

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// HubModerator links users to moderated hubs
type HubModerator struct {
	ID     int `json:"id"`
	HubID  int `json:"hub_id"`
	UserID int `json:"user_id"`
}

// HubModeratorRepository manages hub moderators
type HubModeratorRepository struct {
	pool *pgxpool.Pool
}

// NewHubModeratorRepository creates a new repo
func NewHubModeratorRepository(pool *pgxpool.Pool) *HubModeratorRepository {
	return &HubModeratorRepository{pool: pool}
}

// AddModerator adds a user as mod for a hub
func (r *HubModeratorRepository) AddModerator(ctx context.Context, hubID, userID int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO hub_moderators (hub_id, user_id)
		VALUES ($1, $2) ON CONFLICT DO NOTHING
	`, hubID, userID)
	return err
}

// IsModerator checks if user moderates hub
func (r *HubModeratorRepository) IsModerator(ctx context.Context, hubID, userID int) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM hub_moderators
			WHERE hub_id = $1 AND user_id = $2
		)
	`, hubID, userID).Scan(&exists)
	return exists, err
}

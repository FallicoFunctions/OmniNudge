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

// HubModeratorUser holds limited user info for moderators
type HubModeratorUser struct {
	UserID    int
	Username  string
	AvatarURL *string
}

// ModeratedHubSummary holds hub info for moderator listings
type ModeratedHubSummary struct {
	HubID int
	Name  string
	Title *string
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

// GetModeratorsForHub returns the moderators for a given hub with basic profile info
func (r *HubModeratorRepository) GetModeratorsForHub(ctx context.Context, hubID int) ([]HubModeratorUser, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT u.id, u.username, u.avatar_url
		FROM hub_moderators hm
		JOIN users u ON hm.user_id = u.id
		WHERE hm.hub_id = $1
		ORDER BY u.username ASC
	`, hubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var moderators []HubModeratorUser
	for rows.Next() {
		var mod HubModeratorUser
		if err := rows.Scan(&mod.UserID, &mod.Username, &mod.AvatarURL); err != nil {
			return nil, err
		}
		moderators = append(moderators, mod)
	}
	return moderators, rows.Err()
}

// GetHubsForModerator returns hubs that a user moderates
func (r *HubModeratorRepository) GetHubsForModerator(ctx context.Context, userID int) ([]ModeratedHubSummary, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT h.id, h.name, h.title
		FROM hub_moderators hm
		JOIN hubs h ON hm.hub_id = h.id
		WHERE hm.user_id = $1
		ORDER BY h.name ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hubs []ModeratedHubSummary
	for rows.Next() {
		var hub ModeratedHubSummary
		if err := rows.Scan(&hub.HubID, &hub.Name, &hub.Title); err != nil {
			return nil, err
		}
		hubs = append(hubs, hub)
	}
	return hubs, rows.Err()
}

// RemoveModerator removes a user as moderator from a hub
func (r *HubModeratorRepository) RemoveModerator(ctx context.Context, hubID, userID int) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM hub_moderators
		WHERE hub_id = $1 AND user_id = $2
	`, hubID, userID)
	return err
}

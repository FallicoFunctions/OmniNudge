package models

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type HubBan struct {
	ID        int       `json:"id"`
	HubID     int       `json:"hub_id"`
	UserID    int       `json:"user_id"`
	BannedBy  int       `json:"banned_by"`
	Reason    string    `json:"reason"`
	Note      string    `json:"note"` // Private mod note
	BanType   string    `json:"ban_type"` // 'permanent' or 'temporary'
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time `json:"created_at"`

	// Populated fields
	Username       string `json:"username,omitempty"`
	BannedByName   string `json:"banned_by_name,omitempty"`
}

type HubBanRepository struct {
	db *pgxpool.Pool
}

func NewHubBanRepository(db *pgxpool.Pool) *HubBanRepository {
	return &HubBanRepository{db: db}
}

// BanUser bans a user from a hub
func (r *HubBanRepository) BanUser(ctx context.Context, hubID, userID, bannedBy int, reason, note string, banType string, expiresAt *time.Time) (*HubBan, error) {
	query := `
		INSERT INTO hub_bans (hub_id, user_id, banned_by, reason, note, ban_type, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (hub_id, user_id) DO UPDATE
			SET banned_by = EXCLUDED.banned_by,
				reason = EXCLUDED.reason,
				note = EXCLUDED.note,
				ban_type = EXCLUDED.ban_type,
				expires_at = EXCLUDED.expires_at,
				created_at = NOW()
		RETURNING id, hub_id, user_id, banned_by, reason, note, ban_type, expires_at, created_at
	`

	var ban HubBan
	err := r.db.QueryRow(ctx, query, hubID, userID, bannedBy, reason, note, banType, expiresAt).Scan(
		&ban.ID, &ban.HubID, &ban.UserID, &ban.BannedBy, &ban.Reason, &ban.Note,
		&ban.BanType, &ban.ExpiresAt, &ban.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to ban user: %w", err)
	}

	return &ban, nil
}

// UnbanUser removes a ban from a user
func (r *HubBanRepository) UnbanUser(ctx context.Context, hubID, userID int) error {
	query := `DELETE FROM hub_bans WHERE hub_id = $1 AND user_id = $2`
	result, err := r.db.Exec(ctx, query, hubID, userID)
	if err != nil {
		return fmt.Errorf("failed to unban user: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("no ban found for user %d in hub %d", userID, hubID)
	}

	return nil
}

// IsUserBanned checks if a user is currently banned from a hub
func (r *HubBanRepository) IsUserBanned(ctx context.Context, hubID, userID int) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM hub_bans
			WHERE hub_id = $1 AND user_id = $2
			AND (ban_type = 'permanent' OR expires_at > NOW())
		)
	`

	var banned bool
	err := r.db.QueryRow(ctx, query, hubID, userID).Scan(&banned)
	if err != nil {
		return false, fmt.Errorf("failed to check ban status: %w", err)
	}

	return banned, nil
}

// GetBanByUser gets a specific ban
func (r *HubBanRepository) GetBanByUser(ctx context.Context, hubID, userID int) (*HubBan, error) {
	query := `
		SELECT b.id, b.hub_id, b.user_id, b.banned_by, b.reason, b.note, b.ban_type, b.expires_at, b.created_at,
			   u.username, mod.username as banned_by_name
		FROM hub_bans b
		JOIN users u ON b.user_id = u.id
		JOIN users mod ON b.banned_by = mod.id
		WHERE b.hub_id = $1 AND b.user_id = $2
	`

	var ban HubBan
	err := r.db.QueryRow(ctx, query, hubID, userID).Scan(
		&ban.ID, &ban.HubID, &ban.UserID, &ban.BannedBy, &ban.Reason, &ban.Note,
		&ban.BanType, &ban.ExpiresAt, &ban.CreatedAt, &ban.Username, &ban.BannedByName,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get ban: %w", err)
	}

	return &ban, nil
}

// GetBannedUsers lists all banned users for a hub
func (r *HubBanRepository) GetBannedUsers(ctx context.Context, hubID int) ([]*HubBan, error) {
	query := `
		SELECT b.id, b.hub_id, b.user_id, b.banned_by, b.reason, b.note, b.ban_type, b.expires_at, b.created_at,
			   u.username, mod.username as banned_by_name
		FROM hub_bans b
		JOIN users u ON b.user_id = u.id
		JOIN users mod ON b.banned_by = mod.id
		WHERE b.hub_id = $1
		AND (b.ban_type = 'permanent' OR b.expires_at > NOW())
		ORDER BY b.created_at DESC
	`

	rows, err := r.db.Query(ctx, query, hubID)
	if err != nil {
		return nil, fmt.Errorf("failed to get banned users: %w", err)
	}
	defer rows.Close()

	var bans []*HubBan
	for rows.Next() {
		var ban HubBan
		err := rows.Scan(
			&ban.ID, &ban.HubID, &ban.UserID, &ban.BannedBy, &ban.Reason, &ban.Note,
			&ban.BanType, &ban.ExpiresAt, &ban.CreatedAt, &ban.Username, &ban.BannedByName,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan ban: %w", err)
		}
		bans = append(bans, &ban)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating bans: %w", err)
	}

	return bans, nil
}

// CleanExpiredBans removes expired temporary bans
func (r *HubBanRepository) CleanExpiredBans(ctx context.Context) (int64, error) {
	query := `
		DELETE FROM hub_bans
		WHERE ban_type = 'temporary' AND expires_at <= NOW()
	`

	result, err := r.db.Exec(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("failed to clean expired bans: %w", err)
	}

	return result.RowsAffected(), nil
}

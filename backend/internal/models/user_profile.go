package models

import (
	"context"
	"database/sql"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserProfile stores profile-specific fields separate from auth/account fields.
type UserProfile struct {
	UserID         int
	AvatarURL      *string
	Bio            *string
	StatusText     *string
	BannerURL      *string
	TopFriendsJSON *string
	WallVisibility string
	Location       *string
}

// UserProfileRepository handles persistence for user_profiles.
type UserProfileRepository struct {
	pool *pgxpool.Pool
}

// NewUserProfileRepository creates a new user profile repository.
func NewUserProfileRepository(pool *pgxpool.Pool) *UserProfileRepository {
	return &UserProfileRepository{pool: pool}
}

// GetByUserID loads a profile row by user id.
func (r *UserProfileRepository) GetByUserID(ctx context.Context, userID int) (*UserProfile, error) {
	query := `
		SELECT user_id, avatar_url, bio, status_text, banner_url, top_friends_json, wall_visibility, location
		FROM user_profiles
		WHERE user_id = $1
	`

	profile := &UserProfile{}
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&profile.UserID,
		&profile.AvatarURL,
		&profile.Bio,
		&profile.StatusText,
		&profile.BannerURL,
		&profile.TopFriendsJSON,
		&profile.WallVisibility,
		&profile.Location,
	)
	if err != nil {
		if err == sql.ErrNoRows || err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return profile, nil
}

// GetWallVisibility returns the wall_visibility setting for a user, defaulting to
// "public" if no profile row exists or the column is empty. This avoids loading
// the full profile row when only the visibility is needed.
func (r *UserProfileRepository) GetWallVisibility(ctx context.Context, userID int) (string, error) {
	var visibility sql.NullString
	err := r.pool.QueryRow(ctx, `SELECT wall_visibility FROM user_profiles WHERE user_id = $1`, userID).Scan(&visibility)
	if err != nil {
		if err == sql.ErrNoRows || err == pgx.ErrNoRows {
			return "public", nil
		}
		return "", err
	}
	if !visibility.Valid || strings.TrimSpace(visibility.String) == "" {
		return "public", nil
	}
	return visibility.String, nil
}

// Upsert creates or updates a profile row, replacing all mutable fields.
// Use UpdateTopFriends when only the top_friends_json column should change.
func (r *UserProfileRepository) Upsert(ctx context.Context, userID int, bio, avatarURL, statusText, bannerURL, topFriendsJSON, location *string) error {
	query := `
		INSERT INTO user_profiles (user_id, avatar_url, bio, status_text, banner_url, top_friends_json, location, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
		ON CONFLICT (user_id)
		DO UPDATE SET
			avatar_url = EXCLUDED.avatar_url,
			bio = EXCLUDED.bio,
			status_text = EXCLUDED.status_text,
			banner_url = EXCLUDED.banner_url,
			top_friends_json = EXCLUDED.top_friends_json,
			location = EXCLUDED.location,
			updated_at = NOW()
	`

	_, err := r.pool.Exec(ctx, query, userID, avatarURL, bio, statusText, bannerURL, topFriendsJSON, location)
	return err
}

// UpdateWallVisibility atomically updates only the wall_visibility column,
// preserving all other profile fields. On first call (no existing profile row),
// it seeds a row from the users table, mirroring UpdateTopFriends.
func (r *UserProfileRepository) UpdateWallVisibility(ctx context.Context, userID int, visibility string) error {
	query := `
		INSERT INTO user_profiles (user_id, avatar_url, bio, wall_visibility, created_at, updated_at)
		SELECT id, avatar_url, bio, $2, NOW(), NOW()
		FROM users
		WHERE id = $1
		ON CONFLICT (user_id)
		DO UPDATE SET
			wall_visibility = EXCLUDED.wall_visibility,
			updated_at = NOW()
	`
	_, err := r.pool.Exec(ctx, query, userID, visibility)
	return err
}

// UpdateTopFriends atomically updates only the top_friends_json column,
// preserving all other profile fields and eliminating the read-modify-write race.
// On first call (no existing profile row), it seeds a row from the users table so
// that avatar_url / bio are populated and the users.avatar_url fallback is not shadowed.
func (r *UserProfileRepository) UpdateTopFriends(ctx context.Context, userID int, topFriendsJSON *string) error {
	query := `
		INSERT INTO user_profiles (user_id, avatar_url, bio, top_friends_json, created_at, updated_at)
		SELECT id, avatar_url, bio, $2, NOW(), NOW()
		FROM users
		WHERE id = $1
		ON CONFLICT (user_id)
		DO UPDATE SET
			top_friends_json = EXCLUDED.top_friends_json,
			updated_at = NOW()
	`
	_, err := r.pool.Exec(ctx, query, userID, topFriendsJSON)
	return err
}

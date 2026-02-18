package models

import (
	"context"
	"database/sql"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserProfile stores profile-specific fields separate from auth/account fields.
type UserProfile struct {
	UserID     int
	AvatarURL  *string
	Bio        *string
	StatusText *string
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
		SELECT user_id, avatar_url, bio, status_text
		FROM user_profiles
		WHERE user_id = $1
	`

	profile := &UserProfile{}
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&profile.UserID,
		&profile.AvatarURL,
		&profile.Bio,
		&profile.StatusText,
	)
	if err != nil {
		if err == sql.ErrNoRows || err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return profile, nil
}

// Upsert creates or updates a profile row.
func (r *UserProfileRepository) Upsert(ctx context.Context, userID int, bio, avatarURL, statusText *string) error {
	query := `
		INSERT INTO user_profiles (user_id, avatar_url, bio, status_text, created_at, updated_at)
		VALUES ($1, $2, $3, $4, NOW(), NOW())
		ON CONFLICT (user_id)
		DO UPDATE SET
			avatar_url = EXCLUDED.avatar_url,
			bio = EXCLUDED.bio,
			status_text = EXCLUDED.status_text,
			updated_at = NOW()
	`

	_, err := r.pool.Exec(ctx, query, userID, avatarURL, bio, statusText)
	return err
}

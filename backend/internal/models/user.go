package models

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// User represents a user in the system
type User struct {
	ID           int        `json:"id"`
	Username     string     `json:"username"`
	Email        *string    `json:"email,omitempty"`
	PasswordHash string     `json:"-"` // Never expose password hash in JSON

	// Reddit integration (optional)
	RedditID       *string    `json:"reddit_id,omitempty"`
	RedditUsername *string    `json:"reddit_username,omitempty"`
	AccessToken    string     `json:"-"` // Never expose tokens in JSON
	RefreshToken   string     `json:"-"`
	TokenExpiresAt *time.Time `json:"-"`

	// E2E encryption
	PublicKey *string `json:"public_key,omitempty"`

	// Profile
	AvatarURL *string `json:"avatar_url,omitempty"`
	Bio       *string `json:"bio,omitempty"`
	Karma     int     `json:"karma"`

	// Timestamps
	CreatedAt time.Time `json:"created_at"`
	LastSeen  time.Time `json:"last_seen"`
}

// UserRepository handles database operations for users
type UserRepository struct {
	pool *pgxpool.Pool
}

// NewUserRepository creates a new user repository
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// Create creates a new user with username/password
func (r *UserRepository) Create(ctx context.Context, user *User) error {
	query := `
		INSERT INTO users (username, email, password_hash, avatar_url, bio)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, last_seen
	`

	return r.pool.QueryRow(ctx, query,
		user.Username,
		user.Email,
		user.PasswordHash,
		user.AvatarURL,
		user.Bio,
	).Scan(&user.ID, &user.CreatedAt, &user.LastSeen)
}

// CreateOrUpdateFromReddit creates or updates a user from Reddit OAuth (for future use)
func (r *UserRepository) CreateOrUpdateFromReddit(ctx context.Context, user *User) error {
	query := `
		INSERT INTO users (username, reddit_id, reddit_username, access_token, refresh_token, token_expires_at, karma, avatar_url, password_hash)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '')
		ON CONFLICT (reddit_id)
		DO UPDATE SET
			reddit_username = EXCLUDED.reddit_username,
			access_token = EXCLUDED.access_token,
			refresh_token = EXCLUDED.refresh_token,
			token_expires_at = EXCLUDED.token_expires_at,
			karma = EXCLUDED.karma,
			avatar_url = EXCLUDED.avatar_url,
			last_seen = CURRENT_TIMESTAMP
		RETURNING id, created_at, last_seen
	`

	return r.pool.QueryRow(ctx, query,
		user.Username,
		user.RedditID,
		user.RedditUsername,
		user.AccessToken,
		user.RefreshToken,
		user.TokenExpiresAt,
		user.Karma,
		user.AvatarURL,
	).Scan(&user.ID, &user.CreatedAt, &user.LastSeen)
}

// GetByID retrieves a user by their internal ID
func (r *UserRepository) GetByID(ctx context.Context, id int) (*User, error) {
	user := &User{}

	query := `
		SELECT id, username, email, reddit_id, reddit_username, public_key, avatar_url, bio, karma, created_at, last_seen
		FROM users WHERE id = $1
	`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.RedditID,
		&user.RedditUsername,
		&user.PublicKey,
		&user.AvatarURL,
		&user.Bio,
		&user.Karma,
		&user.CreatedAt,
		&user.LastSeen,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return user, nil
}

// GetByUsername retrieves a user by their username
func (r *UserRepository) GetByUsername(ctx context.Context, username string) (*User, error) {
	user := &User{}

	query := `
		SELECT id, username, email, password_hash, reddit_id, reddit_username, public_key, avatar_url, bio, karma, created_at, last_seen
		FROM users WHERE username = $1
	`

	err := r.pool.QueryRow(ctx, query, username).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.PasswordHash,
		&user.RedditID,
		&user.RedditUsername,
		&user.PublicKey,
		&user.AvatarURL,
		&user.Bio,
		&user.Karma,
		&user.CreatedAt,
		&user.LastSeen,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return user, nil
}

// GetByRedditID retrieves a user by their Reddit ID (for future OAuth)
func (r *UserRepository) GetByRedditID(ctx context.Context, redditID string) (*User, error) {
	user := &User{}

	query := `
		SELECT id, username, email, reddit_id, reddit_username, public_key, avatar_url, bio, karma, created_at, last_seen
		FROM users WHERE reddit_id = $1
	`

	err := r.pool.QueryRow(ctx, query, redditID).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.RedditID,
		&user.RedditUsername,
		&user.PublicKey,
		&user.AvatarURL,
		&user.Bio,
		&user.Karma,
		&user.CreatedAt,
		&user.LastSeen,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return user, nil
}

// UpdateLastSeen updates the last_seen timestamp for a user
func (r *UserRepository) UpdateLastSeen(ctx context.Context, userID int) error {
	query := `UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, userID)
	return err
}

// UpdatePublicKey updates the user's public key for E2E encryption
func (r *UserRepository) UpdatePublicKey(ctx context.Context, userID int, publicKey string) error {
	query := `UPDATE users SET public_key = $1 WHERE id = $2`
	_, err := r.pool.Exec(ctx, query, publicKey, userID)
	return err
}

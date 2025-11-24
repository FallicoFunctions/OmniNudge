package models

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// User represents a user in the system
type User struct {
	ID             int        `json:"id"`
	RedditID       string     `json:"reddit_id"`
	Username       string     `json:"username"`
	AccessToken    string     `json:"-"` // Never expose tokens in JSON
	RefreshToken   string     `json:"-"`
	TokenExpiresAt *time.Time `json:"-"`
	PublicKey      *string    `json:"public_key,omitempty"`
	Karma          int        `json:"karma"`
	AccountCreated *time.Time `json:"account_created,omitempty"`
	AvatarURL      *string    `json:"avatar_url,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	LastSeen       time.Time  `json:"last_seen"`
}

// UserRepository handles database operations for users
type UserRepository struct {
	pool *pgxpool.Pool
}

// NewUserRepository creates a new user repository
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// CreateOrUpdate creates a new user or updates an existing one based on reddit_id
func (r *UserRepository) CreateOrUpdate(ctx context.Context, user *User) error {
	query := `
		INSERT INTO users (reddit_id, username, access_token, refresh_token, token_expires_at, karma, account_created, avatar_url)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (reddit_id)
		DO UPDATE SET
			username = EXCLUDED.username,
			access_token = EXCLUDED.access_token,
			refresh_token = EXCLUDED.refresh_token,
			token_expires_at = EXCLUDED.token_expires_at,
			karma = EXCLUDED.karma,
			avatar_url = EXCLUDED.avatar_url,
			last_seen = CURRENT_TIMESTAMP
		RETURNING id, created_at, last_seen
	`

	return r.pool.QueryRow(ctx, query,
		user.RedditID,
		user.Username,
		user.AccessToken,
		user.RefreshToken,
		user.TokenExpiresAt,
		user.Karma,
		user.AccountCreated,
		user.AvatarURL,
	).Scan(&user.ID, &user.CreatedAt, &user.LastSeen)
}

// GetByID retrieves a user by their internal ID
func (r *UserRepository) GetByID(ctx context.Context, id int) (*User, error) {
	user := &User{}

	query := `
		SELECT id, reddit_id, username, public_key, karma, account_created, avatar_url, created_at, last_seen
		FROM users WHERE id = $1
	`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&user.ID,
		&user.RedditID,
		&user.Username,
		&user.PublicKey,
		&user.Karma,
		&user.AccountCreated,
		&user.AvatarURL,
		&user.CreatedAt,
		&user.LastSeen,
	)

	if err != nil {
		return nil, err
	}

	return user, nil
}

// GetByRedditID retrieves a user by their Reddit ID
func (r *UserRepository) GetByRedditID(ctx context.Context, redditID string) (*User, error) {
	user := &User{}

	query := `
		SELECT id, reddit_id, username, public_key, karma, account_created, avatar_url, created_at, last_seen
		FROM users WHERE reddit_id = $1
	`

	err := r.pool.QueryRow(ctx, query, redditID).Scan(
		&user.ID,
		&user.RedditID,
		&user.Username,
		&user.PublicKey,
		&user.Karma,
		&user.AccountCreated,
		&user.AvatarURL,
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

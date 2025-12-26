package models

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/utils"
)

// User represents a user in the system
type User struct {
	ID              int     `json:"id"`
	Username        string  `json:"username"`
	Email           *string `json:"email,omitempty"`           // Decrypted email (for API responses)
	EmailEncrypted  bool    `json:"-"`                         // Whether email is encrypted in DB
	EncryptedEmail  *string `json:"-"`                         // Encrypted email (stored in DB)
	PasswordHash    string  `json:"-"`                         // Never expose password hash in JSON

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
	Role      string  `json:"role"` // user, moderator, admin

	// Timestamps
	CreatedAt time.Time `json:"created_at"`
	LastSeen  time.Time `json:"last_seen"`
	NSFW      bool      `json:"nsfw"`
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
	// Encrypt email if provided
	var encryptedEmail *string
	var emailEncrypted bool
	if user.Email != nil && *user.Email != "" {
		encrypted, err := utils.EncryptEmail(*user.Email)
		if err != nil {
			return err
		}
		encryptedEmail = &encrypted
		emailEncrypted = true
	}

	query := `
		INSERT INTO users (username, email, email_encrypted, password_hash, avatar_url, bio, nsfw)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, last_seen, role, nsfw
	`

	return r.pool.QueryRow(ctx, query,
		user.Username,
		encryptedEmail,
		emailEncrypted,
		user.PasswordHash,
		user.AvatarURL,
		user.Bio,
		user.NSFW,
	).Scan(&user.ID, &user.CreatedAt, &user.LastSeen, &user.Role, &user.NSFW)
}

// CreateOrUpdateFromReddit creates or updates a user from Reddit OAuth (for future use)
func (r *UserRepository) CreateOrUpdateFromReddit(ctx context.Context, user *User) error {
	query := `
		INSERT INTO users (username, reddit_id, reddit_username, access_token, refresh_token, token_expires_at, karma, avatar_url, password_hash, nsfw)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', $9)
		ON CONFLICT (reddit_id)
		DO UPDATE SET
			reddit_username = EXCLUDED.reddit_username,
			access_token = EXCLUDED.access_token,
			refresh_token = EXCLUDED.refresh_token,
			token_expires_at = EXCLUDED.token_expires_at,
			karma = EXCLUDED.karma,
			avatar_url = EXCLUDED.avatar_url,
			last_seen = CURRENT_TIMESTAMP
		RETURNING id, created_at, last_seen, role, nsfw
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
		user.NSFW,
	).Scan(&user.ID, &user.CreatedAt, &user.LastSeen, &user.Role, &user.NSFW)
}

// GetByID retrieves a user by their internal ID
func (r *UserRepository) GetByID(ctx context.Context, id int) (*User, error) {
	user := &User{}

	query := `
		SELECT id, username, email, email_encrypted, reddit_id, reddit_username, public_key, avatar_url, bio, karma, role, created_at, last_seen
		FROM users WHERE id = $1
	`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&user.ID,
		&user.Username,
		&user.EncryptedEmail,
		&user.EmailEncrypted,
		&user.RedditID,
		&user.RedditUsername,
		&user.PublicKey,
		&user.AvatarURL,
		&user.Bio,
		&user.Karma,
		&user.Role,
		&user.CreatedAt,
		&user.LastSeen,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	// Decrypt email if it's encrypted
	if user.EncryptedEmail != nil && user.EmailEncrypted {
		decrypted, err := utils.DecryptEmail(*user.EncryptedEmail)
		if err != nil {
			return nil, err
		}
		user.Email = &decrypted
	} else if user.EncryptedEmail != nil {
		// Email is not encrypted (legacy data)
		user.Email = user.EncryptedEmail
	}

	return user, nil
}

// GetByUsername retrieves a user by their username
func (r *UserRepository) GetByUsername(ctx context.Context, username string) (*User, error) {
	if username == "" {
		return nil, nil
	}

	// Prefer exact match to avoid collisions between usernames that only differ by case.
	if user, err := r.queryUser(ctx, `
		SELECT id, username, email, email_encrypted, password_hash, reddit_id, reddit_username, public_key, avatar_url, bio, karma, role, created_at, last_seen
		FROM users WHERE username = $1
	`, username); err != nil || user != nil {
		return user, err
	}

	// Fallback to case-insensitive/trimmed lookup for legacy data that may contain inconsistent casing/spacing.
	return r.queryUser(ctx, `
		SELECT id, username, email, email_encrypted, password_hash, reddit_id, reddit_username, public_key, avatar_url, bio, karma, role, created_at, last_seen
		FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1))
	`, username)
}

func (r *UserRepository) queryUser(ctx context.Context, query string, arg interface{}) (*User, error) {
	user := &User{}

	err := r.pool.QueryRow(ctx, query, arg).Scan(
		&user.ID,
		&user.Username,
		&user.EncryptedEmail,
		&user.EmailEncrypted,
		&user.PasswordHash,
		&user.RedditID,
		&user.RedditUsername,
		&user.PublicKey,
		&user.AvatarURL,
		&user.Bio,
		&user.Karma,
		&user.Role,
		&user.CreatedAt,
		&user.LastSeen,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	// Decrypt email if it's encrypted
	if user.EncryptedEmail != nil && user.EmailEncrypted {
		decrypted, err := utils.DecryptEmail(*user.EncryptedEmail)
		if err != nil {
			return nil, err
		}
		user.Email = &decrypted
	} else if user.EncryptedEmail != nil {
		// Email is not encrypted (legacy data)
		user.Email = user.EncryptedEmail
	}

	return user, nil
}

// GetByRedditID retrieves a user by their Reddit ID (for future OAuth)
func (r *UserRepository) GetByRedditID(ctx context.Context, redditID string) (*User, error) {
	user := &User{}

	query := `
		SELECT id, username, email, email_encrypted, reddit_id, reddit_username, public_key, avatar_url, bio, karma, role, created_at, last_seen
		FROM users WHERE reddit_id = $1
	`

	err := r.pool.QueryRow(ctx, query, redditID).Scan(
		&user.ID,
		&user.Username,
		&user.EncryptedEmail,
		&user.EmailEncrypted,
		&user.RedditID,
		&user.RedditUsername,
		&user.PublicKey,
		&user.AvatarURL,
		&user.Bio,
		&user.Karma,
		&user.Role,
		&user.CreatedAt,
		&user.LastSeen,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	// Decrypt email if it's encrypted
	if user.EncryptedEmail != nil && user.EmailEncrypted {
		decrypted, err := utils.DecryptEmail(*user.EncryptedEmail)
		if err != nil {
			return nil, err
		}
		user.Email = &decrypted
	} else if user.EncryptedEmail != nil {
		// Email is not encrypted (legacy data)
		user.Email = user.EncryptedEmail
	}

	return user, nil
}

// UpdateLastSeen updates the last_seen timestamp for a user
func (r *UserRepository) UpdateLastSeen(ctx context.Context, userID int) error {
	query := `UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, userID)
	return err
}

// UpdateRole updates a user's role
func (r *UserRepository) UpdateRole(ctx context.Context, userID int, role string) error {
	_, err := r.pool.Exec(ctx, `UPDATE users SET role = $2 WHERE id = $1`, userID, role)
	return err
}

// UpdatePublicKey updates the user's public key for E2E encryption
func (r *UserRepository) UpdatePublicKey(ctx context.Context, userID int, publicKey string) error {
	query := `UPDATE users SET public_key = $1 WHERE id = $2`
	_, err := r.pool.Exec(ctx, query, publicKey, userID)
	return err
}

// UpdateProfile updates a user's bio and avatar
func (r *UserRepository) UpdateProfile(ctx context.Context, userID int, bio *string, avatarURL *string) error {
	query := `UPDATE users SET bio = $1, avatar_url = $2 WHERE id = $3`
	_, err := r.pool.Exec(ctx, query, bio, avatarURL, userID)
	return err
}

// UpdatePassword updates a user's password hash
func (r *UserRepository) UpdatePassword(ctx context.Context, userID int, passwordHash string) error {
	query := `UPDATE users SET password_hash = $1 WHERE id = $2`
	_, err := r.pool.Exec(ctx, query, passwordHash, userID)
	return err
}

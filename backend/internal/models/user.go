package models

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/utils"
)

// User represents a user in the system
type User struct {
	ID                 int     `json:"id"`
	Username           string  `json:"username"`
	UsernameNormalized string  `json:"-"`               // Lowercase username for case-insensitive lookups
	Email              *string `json:"email,omitempty"` // Decrypted email (for API responses)
	EmailEncrypted     bool    `json:"-"`               // Whether email is encrypted in DB
	EmailVerified      bool    `json:"email_verified"`  // Whether email has been verified
	EncryptedEmail     *string `json:"-"`               // Encrypted email (stored in DB)
	PasswordHash       string  `json:"-"`               // Never expose password hash in JSON

	// Reddit integration (optional)
	RedditID       *string    `json:"reddit_id,omitempty"`
	RedditUsername *string    `json:"reddit_username,omitempty"`
	AccessToken    string     `json:"-"` // Never expose tokens in JSON
	RefreshToken   string     `json:"-"`
	TokenExpiresAt *time.Time `json:"-"`

	// E2E encryption
	PublicKey           *string `json:"public_key,omitempty"`
	EncryptedPrivateKey *string `json:"encrypted_private_key,omitempty"` // For cross-browser sync

	// Profile
	AvatarURL *string `json:"avatar_url,omitempty"`
	Bio       *string `json:"bio,omitempty"`
	Karma     int     `json:"karma"`
	Role      string  `json:"role"` // user, moderator, admin

	// Ban/moderation fields
	ShadowBanned  bool       `json:"shadow_banned"`
	Banned        bool       `json:"banned"`
	Deleted       bool       `json:"deleted"`
	BanReason     *string    `json:"ban_reason,omitempty"`
	ShowBanReason bool       `json:"show_ban_reason"`
	BannedAt      *time.Time `json:"banned_at,omitempty"`
	BannedBy      *int       `json:"banned_by,omitempty"`

	// Timestamps
	CreatedAt time.Time `json:"created_at"`
	LastSeen  time.Time `json:"last_seen"`
	NSFW      bool      `json:"nsfw"`

	// Agent activity tracking
	LastAgentPostAt   *time.Time `json:"last_agent_post_at,omitempty"`
	LastAgentBrowseAt *time.Time `json:"last_agent_browse_at,omitempty"`

	// Policy acceptance (GDPR/Legal compliance)
	PrivacyPolicyVersion  *string    `json:"-"` // Version of privacy policy accepted
	TermsOfServiceVersion *string    `json:"-"` // Version of terms accepted
	PrivacyAcceptedAt     *time.Time `json:"-"` // When privacy policy was accepted
	TermsAcceptedAt       *time.Time `json:"-"` // When terms were accepted
}

// UserRepository handles database operations for users
type UserRepository struct {
	pool *pgxpool.Pool
}

// UserRoleContact stores minimal recipient info for role-based notifications.
type UserRoleContact struct {
	ID       int
	Username string
	Role     string
	Email    *string
}

// NewUserRepository creates a new user repository
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// GetPool returns the database connection pool
func (r *UserRepository) GetPool() *pgxpool.Pool {
	return r.pool
}

// Create creates a new user with username/password
func (r *UserRepository) Create(ctx context.Context, user *User) error {
	// Set normalized username for case-insensitive uniqueness
	user.UsernameNormalized = strings.ToLower(user.Username)

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
		INSERT INTO users (username, username_normalized, email, email_encrypted, password_hash, avatar_url, bio, nsfw)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at, last_seen, role, nsfw
	`

	return r.pool.QueryRow(ctx, query,
		user.Username,
		user.UsernameNormalized,
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
		SELECT id, username, email, email_encrypted, email_verified, reddit_id, reddit_username, public_key, encrypted_private_key, avatar_url, bio, karma, role,
		       shadow_banned, banned, deleted, ban_reason, show_ban_reason, banned_at, banned_by, created_at, last_seen,
		       last_agent_post_at, last_agent_browse_at
		FROM users WHERE id = $1
	`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&user.ID,
		&user.Username,
		&user.EncryptedEmail,
		&user.EmailEncrypted,
		&user.EmailVerified,
		&user.RedditID,
		&user.RedditUsername,
		&user.PublicKey,
		&user.EncryptedPrivateKey,
		&user.AvatarURL,
		&user.Bio,
		&user.Karma,
		&user.Role,
		&user.ShadowBanned,
		&user.Banned,
		&user.Deleted,
		&user.BanReason,
		&user.ShowBanReason,
		&user.BannedAt,
		&user.BannedBy,
		&user.CreatedAt,
		&user.LastSeen,
		&user.LastAgentPostAt,
		&user.LastAgentBrowseAt,
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
			// Log the error but don't block user operations
			// This can happen if encryption key changed
			log.Printf("WARNING: Failed to decrypt email for user_id=%d: %v (key mismatch?)", user.ID, err)
			// Set email to nil - user can re-add it in settings
			user.Email = nil
		} else {
			user.Email = &decrypted
		}
	} else if user.EncryptedEmail != nil {
		// Email is not encrypted (legacy data)
		user.Email = user.EncryptedEmail
	}

	return user, nil
}

// GetPublicKeysByIDs retrieves public keys for a set of user IDs.
func (r *UserRepository) GetPublicKeysByIDs(ctx context.Context, userIDs []int) (map[int]string, error) {
	publicKeys := make(map[int]string)
	if len(userIDs) == 0 {
		return publicKeys, nil
	}

	query := `
		SELECT id, public_key
		FROM users
		WHERE id = ANY($1) AND public_key IS NOT NULL
	`
	rows, err := r.pool.Query(ctx, query, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var publicKey string
		if err := rows.Scan(&id, &publicKey); err != nil {
			return nil, err
		}
		publicKeys[id] = publicKey
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return publicKeys, nil
}

// ListUserIDsByRoles returns user IDs whose role is in the provided set.
func (r *UserRepository) ListUserIDsByRoles(ctx context.Context, roles []string) ([]int, error) {
	if len(roles) == 0 {
		return []int{}, nil
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id
		FROM users
		WHERE role = ANY($1)
		  AND deleted = false
	`, roles)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := make([]int, 0)
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ListUserContactsByRoles returns minimal user contact data for users in the provided roles.
func (r *UserRepository) ListUserContactsByRoles(ctx context.Context, roles []string) ([]UserRoleContact, error) {
	if len(roles) == 0 {
		return []UserRoleContact{}, nil
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, username, role, email, email_encrypted
		FROM users
		WHERE role = ANY($1)
		  AND deleted = false
	`, roles)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	contacts := make([]UserRoleContact, 0)
	for rows.Next() {
		var contact UserRoleContact
		var encryptedEmail *string
		var emailEncrypted bool
		if err := rows.Scan(&contact.ID, &contact.Username, &contact.Role, &encryptedEmail, &emailEncrypted); err != nil {
			return nil, err
		}
		if encryptedEmail != nil {
			if emailEncrypted {
				decrypted, decryptErr := utils.DecryptEmail(*encryptedEmail)
				if decryptErr != nil {
					log.Printf("Warning: failed to decrypt email for user_id=%d: %v", contact.ID, decryptErr)
				} else {
					contact.Email = &decrypted
				}
			} else {
				contact.Email = encryptedEmail
			}
		}
		contacts = append(contacts, contact)
	}
	return contacts, rows.Err()
}

// GetByUsername retrieves a user by their username (case-insensitive)
func (r *UserRepository) GetByUsername(ctx context.Context, username string) (*User, error) {
	if username == "" {
		return nil, nil
	}

	// Use username_normalized for case-insensitive lookup
	normalizedUsername := strings.ToLower(strings.TrimSpace(username))

	return r.queryUser(ctx, `
		SELECT id, username, email, email_encrypted, email_verified, password_hash, reddit_id, reddit_username, public_key, encrypted_private_key, avatar_url, bio, karma, role,
		       shadow_banned, banned, deleted, ban_reason, show_ban_reason, banned_at, banned_by, created_at, last_seen,
		       last_agent_post_at, last_agent_browse_at
		FROM users WHERE username_normalized = $1
	`, normalizedUsername)
}

func (r *UserRepository) queryUser(ctx context.Context, query string, arg interface{}) (*User, error) {
	user := &User{}

	err := r.pool.QueryRow(ctx, query, arg).Scan(
		&user.ID,
		&user.Username,
		&user.EncryptedEmail,
		&user.EmailEncrypted,
		&user.EmailVerified,
		&user.PasswordHash,
		&user.RedditID,
		&user.RedditUsername,
		&user.PublicKey,
		&user.EncryptedPrivateKey,
		&user.AvatarURL,
		&user.Bio,
		&user.Karma,
		&user.Role,
		&user.ShadowBanned,
		&user.Banned,
		&user.Deleted,
		&user.BanReason,
		&user.ShowBanReason,
		&user.BannedAt,
		&user.BannedBy,
		&user.CreatedAt,
		&user.LastSeen,
		&user.LastAgentPostAt,
		&user.LastAgentBrowseAt,
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
			// Log the error but don't block user operations
			// This can happen if encryption key changed
			log.Printf("WARNING: Failed to decrypt email for user_id=%d: %v (key mismatch?)", user.ID, err)
			// Set email to nil - user can re-add it in settings
			user.Email = nil
		} else {
			user.Email = &decrypted
		}
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
		SELECT id, username, email, email_encrypted, email_verified, reddit_id, reddit_username, public_key, encrypted_private_key, avatar_url, bio, karma, role,
		       shadow_banned, banned, deleted, ban_reason, show_ban_reason, banned_at, banned_by, created_at, last_seen,
		       last_agent_post_at, last_agent_browse_at
		FROM users WHERE reddit_id = $1
	`

	err := r.pool.QueryRow(ctx, query, redditID).Scan(
		&user.ID,
		&user.Username,
		&user.EncryptedEmail,
		&user.EmailEncrypted,
		&user.EmailVerified,
		&user.RedditID,
		&user.RedditUsername,
		&user.PublicKey,
		&user.EncryptedPrivateKey,
		&user.AvatarURL,
		&user.Bio,
		&user.Karma,
		&user.Role,
		&user.ShadowBanned,
		&user.Banned,
		&user.Deleted,
		&user.BanReason,
		&user.ShowBanReason,
		&user.BannedAt,
		&user.BannedBy,
		&user.CreatedAt,
		&user.LastSeen,
		&user.LastAgentPostAt,
		&user.LastAgentBrowseAt,
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
			// Log the error but don't block user operations
			// This can happen if encryption key changed
			log.Printf("WARNING: Failed to decrypt email for user_id=%d: %v (key mismatch?)", user.ID, err)
			// Set email to nil - user can re-add it in settings
			user.Email = nil
		} else {
			user.Email = &decrypted
		}
	} else if user.EncryptedEmail != nil {
		// Email is not encrypted (legacy data)
		user.Email = user.EncryptedEmail
	}

	return user, nil
}

// GetByEmail retrieves a user by their email address
// Note: Email is encrypted in database, so this requires decryption
func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*User, error) {
	// NOTE: Since AES-CFB encryption uses random IVs, we can't compare encrypted emails directly.
	// Instead, we fetch all users and decrypt their emails to find a match.
	// TODO: Add an email_hash column for efficient lookups.

	query := `
		SELECT id, username, email, email_encrypted, email_verified, reddit_id, reddit_username, public_key, encrypted_private_key, avatar_url, bio, karma, role,
		       shadow_banned, banned, deleted, ban_reason, show_ban_reason, banned_at, banned_by, created_at, last_seen,
		       last_agent_post_at, last_agent_browse_at, password_hash
		FROM users WHERE email IS NOT NULL AND deleted = false
	`

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		user := &User{}
		err = rows.Scan(
			&user.ID,
			&user.Username,
			&user.EncryptedEmail,
			&user.EmailEncrypted,
			&user.EmailVerified,
			&user.RedditID,
			&user.RedditUsername,
			&user.PublicKey,
			&user.EncryptedPrivateKey,
			&user.AvatarURL,
			&user.Bio,
			&user.Karma,
			&user.Role,
			&user.ShadowBanned,
			&user.Banned,
			&user.Deleted,
			&user.BanReason,
			&user.ShowBanReason,
			&user.BannedAt,
			&user.BannedBy,
			&user.CreatedAt,
			&user.LastSeen,
			&user.LastAgentPostAt,
			&user.LastAgentBrowseAt,
			&user.PasswordHash,
		)
		if err != nil {
			continue // Skip this user if scan fails
		}

		// Decrypt the stored email and compare
		if user.EncryptedEmail != nil {
			decryptedEmail, err := utils.DecryptEmail(*user.EncryptedEmail)
			if err != nil {
				continue // Skip if decryption fails
			}
			if decryptedEmail == email {
				// Populate email field for API response
				user.Email = &decryptedEmail
				return user, nil // Found matching user
			}
		}
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return nil, fmt.Errorf("no rows in result set")
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

// BanStatus represents ban/shadow-ban/delete flags for a user
type BanStatus struct {
	ShadowBanned  bool
	Banned        bool
	Deleted       bool
	BanReason     *string
	ShowBanReason bool
}

// GetBanStatus fetches ban flags for a user
func (r *UserRepository) GetBanStatus(ctx context.Context, userID int) (*BanStatus, error) {
	status := &BanStatus{}
	err := r.pool.QueryRow(ctx, `
		SELECT shadow_banned, banned, deleted, ban_reason, show_ban_reason
		FROM users
		WHERE id = $1
	`, userID).Scan(
		&status.ShadowBanned,
		&status.Banned,
		&status.Deleted,
		&status.BanReason,
		&status.ShowBanReason,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return status, nil
}

// BanHistory represents a ban history record
type BanHistory struct {
	ID         int       `json:"id"`
	UserID     int       `json:"user_id"`
	Action     string    `json:"action"` // 'shadow_ban', 'ban', 'unban', 'delete', 'restore'
	Reason     string    `json:"reason"`
	ShowReason bool      `json:"show_reason"`
	AdminID    int       `json:"admin_id"`
	AdminName  string    `json:"admin_name"`
	CreatedAt  time.Time `json:"created_at"`
}

// ShadowBanUser shadow bans a user
func (r *UserRepository) ShadowBanUser(ctx context.Context, userID int, reason string, showReason bool, adminID int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Update user
	query := `
		UPDATE users
		SET shadow_banned = true, ban_reason = $2, show_ban_reason = $3, banned_at = NOW(), banned_by = $4
		WHERE id = $1
	`
	_, err = tx.Exec(ctx, query, userID, reason, showReason, adminID)
	if err != nil {
		return err
	}

	// Add to ban history
	historyQuery := `
		INSERT INTO ban_history (user_id, action, reason, show_reason, admin_id)
		VALUES ($1, 'shadow_ban', $2, $3, $4)
	`
	_, err = tx.Exec(ctx, historyQuery, userID, reason, showReason, adminID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// BanUser bans a user (regular ban with force logout)
func (r *UserRepository) BanUser(ctx context.Context, userID int, reason string, showReason bool, adminID int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Update user
	query := `
		UPDATE users
		SET banned = true, ban_reason = $2, show_ban_reason = $3, banned_at = NOW(), banned_by = $4
		WHERE id = $1
	`
	_, err = tx.Exec(ctx, query, userID, reason, showReason, adminID)
	if err != nil {
		return err
	}

	// Add to ban history
	historyQuery := `
		INSERT INTO ban_history (user_id, action, reason, show_reason, admin_id)
		VALUES ($1, 'ban', $2, $3, $4)
	`
	_, err = tx.Exec(ctx, historyQuery, userID, reason, showReason, adminID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// AutoSuspendForReports marks a user as banned when repeated reports exceed threshold.
// This path is system-initiated, so banned_by remains NULL.
func (r *UserRepository) AutoSuspendForReports(ctx context.Context, userID int, reason string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE users
		SET banned = true,
		    ban_reason = $2,
		    show_ban_reason = false,
		    banned_at = NOW(),
		    banned_by = NULL
		WHERE id = $1
		  AND deleted = false
		  AND banned = false
	`, userID, reason)
	return err
}

// UnbanUser unbans a user (clears both shadow ban and regular ban)
func (r *UserRepository) UnbanUser(ctx context.Context, userID int, reason string, adminID int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Update user
	query := `
		UPDATE users
		SET shadow_banned = false, banned = false, ban_reason = NULL, show_ban_reason = false, banned_at = NULL, banned_by = NULL
		WHERE id = $1
	`
	_, err = tx.Exec(ctx, query, userID)
	if err != nil {
		return err
	}

	// Add to ban history
	historyQuery := `
		INSERT INTO ban_history (user_id, action, reason, show_reason, admin_id)
		VALUES ($1, 'unban', $2, false, $3)
	`
	_, err = tx.Exec(ctx, historyQuery, userID, reason, adminID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// SoftDeleteUser soft deletes a user
func (r *UserRepository) SoftDeleteUser(ctx context.Context, userID int, reason string, adminID int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Update user
	query := `
		UPDATE users
		SET deleted = true, ban_reason = $2, banned_at = NOW(), banned_by = $3
		WHERE id = $1
	`
	_, err = tx.Exec(ctx, query, userID, reason, adminID)
	if err != nil {
		return err
	}

	// Add to ban history
	historyQuery := `
		INSERT INTO ban_history (user_id, action, reason, show_reason, admin_id)
		VALUES ($1, 'delete', $2, false, $3)
	`
	_, err = tx.Exec(ctx, historyQuery, userID, reason, adminID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetBanHistory retrieves ban history for a user
func (r *UserRepository) GetBanHistory(ctx context.Context, userID int) ([]BanHistory, error) {
	query := `
		SELECT bh.id, bh.user_id, bh.action, bh.reason, bh.show_reason, bh.admin_id, u.username as admin_name, bh.created_at
		FROM ban_history bh
		JOIN users u ON u.id = bh.admin_id
		WHERE bh.user_id = $1
		ORDER BY bh.created_at DESC
	`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []BanHistory
	for rows.Next() {
		var h BanHistory
		err := rows.Scan(&h.ID, &h.UserID, &h.Action, &h.Reason, &h.ShowReason, &h.AdminID, &h.AdminName, &h.CreatedAt)
		if err != nil {
			return nil, err
		}
		history = append(history, h)
	}

	return history, rows.Err()
}

// GetAllBanHistory retrieves all ban history (for admin panel)
func (r *UserRepository) GetAllBanHistory(ctx context.Context, limit, offset int) ([]BanHistory, error) {
	query := `
		SELECT bh.id, bh.user_id, bh.action, bh.reason, bh.show_reason, bh.admin_id, u.username as admin_name, bh.created_at
		FROM ban_history bh
		JOIN users u ON u.id = bh.admin_id
		ORDER BY bh.created_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := r.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []BanHistory
	for rows.Next() {
		var h BanHistory
		err := rows.Scan(&h.ID, &h.UserID, &h.Action, &h.Reason, &h.ShowReason, &h.AdminID, &h.AdminName, &h.CreatedAt)
		if err != nil {
			return nil, err
		}
		history = append(history, h)
	}

	return history, rows.Err()
}

// GetAllBanHistoryWithCursor retrieves ban history with cursor-based pagination.
func (r *UserRepository) GetAllBanHistoryWithCursor(ctx context.Context, limit int, cursor *TimeCursor) ([]BanHistory, error) {
	query := `
		SELECT bh.id, bh.user_id, bh.action, bh.reason, bh.show_reason, bh.admin_id, u.username as admin_name, bh.created_at
		FROM ban_history bh
		JOIN users u ON u.id = bh.admin_id
		WHERE 1=1
	`
	args := []interface{}{}
	paramIdx := 1
	if cursor != nil {
		query += fmt.Sprintf(" AND (bh.created_at, bh.id) < ($%d, $%d)", paramIdx, paramIdx+1)
		args = append(args, cursor.Timestamp, cursor.ID)
		paramIdx += 2
	}
	query += fmt.Sprintf(" ORDER BY bh.created_at DESC, bh.id DESC LIMIT $%d", paramIdx)
	args = append(args, limit)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []BanHistory
	for rows.Next() {
		var h BanHistory
		err := rows.Scan(&h.ID, &h.UserID, &h.Action, &h.Reason, &h.ShowReason, &h.AdminID, &h.AdminName, &h.CreatedAt)
		if err != nil {
			return nil, err
		}
		history = append(history, h)
	}

	return history, rows.Err()
}

// UpdateLastAgentPostAt updates the last_agent_post_at timestamp for a user
func (r *UserRepository) UpdateLastAgentPostAt(ctx context.Context, userID int, timestamp time.Time) error {
	query := `UPDATE users SET last_agent_post_at = $1 WHERE id = $2`
	_, err := r.pool.Exec(ctx, query, timestamp, userID)
	return err
}

// UpdateLastAgentBrowseAt updates the last_agent_browse_at timestamp for a user
func (r *UserRepository) UpdateLastAgentBrowseAt(ctx context.Context, userID int, timestamp time.Time) error {
	query := `UPDATE users SET last_agent_browse_at = $1 WHERE id = $2`
	_, err := r.pool.Exec(ctx, query, timestamp, userID)
	return err
}

// UpdateEncryptedPrivateKey updates the user's encrypted private key for cross-browser sync
func (r *UserRepository) UpdateEncryptedPrivateKey(ctx context.Context, userID int, encryptedPrivateKey string) error {
	query := `UPDATE users SET encrypted_private_key = $1 WHERE id = $2`
	_, err := r.pool.Exec(ctx, query, encryptedPrivateKey, userID)
	return err
}

// UpdateEmail updates a user's email address (encrypted)
func (r *UserRepository) UpdateEmail(ctx context.Context, userID int, email *string) error {
	var encryptedEmail *string
	var emailEncrypted bool

	if email != nil && *email != "" {
		encrypted, err := utils.EncryptEmail(*email)
		if err != nil {
			return err
		}
		encryptedEmail = &encrypted
		emailEncrypted = true
	}

	query := `UPDATE users SET email = $1, email_encrypted = $2 WHERE id = $3`
	_, err := r.pool.Exec(ctx, query, encryptedEmail, emailEncrypted, userID)
	return err
}

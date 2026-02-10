package models

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PasswordReset represents a password reset token
type PasswordReset struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	UsedAt    *time.Time `json:"used_at"`
	CreatedAt time.Time `json:"created_at"`
}

// PasswordResetRepository handles password reset database operations
type PasswordResetRepository struct {
	db *pgxpool.Pool
}

// NewPasswordResetRepository creates a new password reset repository
func NewPasswordResetRepository(db *pgxpool.Pool) *PasswordResetRepository {
	return &PasswordResetRepository{db: db}
}

// GenerateToken creates a new password reset token for a user
func (r *PasswordResetRepository) GenerateToken(ctx context.Context, userID int) (*PasswordReset, error) {
	// Generate secure random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}
	token := base64.URLEncoding.EncodeToString(tokenBytes)

	// Token expires in 1 hour
	expiresAt := time.Now().Add(1 * time.Hour)

	// Insert token into database
	query := `
		INSERT INTO password_resets (user_id, token, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id, user_id, token, expires_at, used_at, created_at
	`

	reset := &PasswordReset{}
	err := r.db.QueryRow(ctx, query, userID, token, expiresAt).Scan(
		&reset.ID,
		&reset.UserID,
		&reset.Token,
		&reset.ExpiresAt,
		&reset.UsedAt,
		&reset.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create password reset token: %w", err)
	}

	return reset, nil
}

// GetByToken retrieves a password reset by token
func (r *PasswordResetRepository) GetByToken(ctx context.Context, token string) (*PasswordReset, error) {
	query := `
		SELECT id, user_id, token, expires_at, used_at, created_at
		FROM password_resets
		WHERE token = $1
	`

	reset := &PasswordReset{}
	err := r.db.QueryRow(ctx, query, token).Scan(
		&reset.ID,
		&reset.UserID,
		&reset.Token,
		&reset.ExpiresAt,
		&reset.UsedAt,
		&reset.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("password reset token not found: %w", err)
	}

	return reset, nil
}

// MarkAsUsed marks a password reset token as used
func (r *PasswordResetRepository) MarkAsUsed(ctx context.Context, token string) error {
	query := `
		UPDATE password_resets
		SET used_at = NOW()
		WHERE token = $1 AND used_at IS NULL
	`

	result, err := r.db.Exec(ctx, query, token)
	if err != nil {
		return fmt.Errorf("failed to mark token as used: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("token not found or already used")
	}

	return nil
}

// IsValid checks if a token is valid (exists, not expired, not used)
func (r *PasswordResetRepository) IsValid(ctx context.Context, token string) (bool, int, error) {
	reset, err := r.GetByToken(ctx, token)
	if err != nil {
		return false, 0, err
	}

	// Check if already used
	if reset.UsedAt != nil {
		return false, 0, fmt.Errorf("token already used")
	}

	// Check if expired
	if time.Now().After(reset.ExpiresAt) {
		return false, 0, fmt.Errorf("token expired")
	}

	return true, reset.UserID, nil
}

// DeleteOldTokens removes expired tokens (cleanup job)
func (r *PasswordResetRepository) DeleteOldTokens(ctx context.Context) (int64, error) {
	query := `
		DELETE FROM password_resets
		WHERE expires_at < NOW() - INTERVAL '24 hours'
	`

	result, err := r.db.Exec(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("failed to delete old tokens: %w", err)
	}

	return result.RowsAffected(), nil
}

// InvalidateUserTokens invalidates all active tokens for a user
func (r *PasswordResetRepository) InvalidateUserTokens(ctx context.Context, userID int) error {
	query := `
		UPDATE password_resets
		SET used_at = NOW()
		WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
	`

	_, err := r.db.Exec(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("failed to invalidate user tokens: %w", err)
	}

	return nil
}

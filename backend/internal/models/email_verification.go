package models

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// EmailVerification represents an email verification token
type EmailVerification struct {
	ID         int        `json:"id"`
	UserID     int        `json:"user_id"`
	Email      string     `json:"email"`
	Token      string     `json:"token"`
	Purpose    string     `json:"purpose"` // 'registration', 'update_email'
	ExpiresAt  time.Time  `json:"expires_at"`
	VerifiedAt *time.Time `json:"verified_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// EmailVerificationRepository handles email verification operations
type EmailVerificationRepository struct {
	pool *pgxpool.Pool
}

// NewEmailVerificationRepository creates a new email verification repository
func NewEmailVerificationRepository(pool *pgxpool.Pool) *EmailVerificationRepository {
	return &EmailVerificationRepository{pool: pool}
}

// GenerateToken creates a new email verification token
func (r *EmailVerificationRepository) GenerateToken(ctx context.Context, userID int, email, purpose string) (*EmailVerification, error) {
	// Generate random token (32 bytes = 256 bits)
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}
	token := base64.URLEncoding.EncodeToString(tokenBytes)

	// Token expires in 24 hours
	expiresAt := time.Now().Add(24 * time.Hour)

	verification := &EmailVerification{
		UserID:    userID,
		Email:     email,
		Token:     token,
		Purpose:   purpose,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	}

	query := `
		INSERT INTO email_verifications (user_id, email, token, purpose, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`

	err := r.pool.QueryRow(ctx, query, userID, email, token, purpose, expiresAt).Scan(
		&verification.ID,
		&verification.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create verification token: %w", err)
	}

	return verification, nil
}

// Verify marks a token as verified and returns the verification record
func (r *EmailVerificationRepository) Verify(ctx context.Context, token string) (*EmailVerification, error) {
	verification := &EmailVerification{}
	now := time.Now()

	query := `
		UPDATE email_verifications
		SET verified_at = $1
		WHERE token = $2 AND verified_at IS NULL AND expires_at > $1
		RETURNING id, user_id, email, token, purpose, expires_at, verified_at, created_at
	`

	err := r.pool.QueryRow(ctx, query, now, token).Scan(
		&verification.ID,
		&verification.UserID,
		&verification.Email,
		&verification.Token,
		&verification.Purpose,
		&verification.ExpiresAt,
		&verification.VerifiedAt,
		&verification.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("invalid or expired verification token: %w", err)
	}

	return verification, nil
}

// IsValid checks if a token is valid without marking it as verified
func (r *EmailVerificationRepository) IsValid(ctx context.Context, token string) (bool, int, string, error) {
	var userID int
	var purpose string
	var expiresAt time.Time

	query := `
		SELECT user_id, purpose, expires_at
		FROM email_verifications
		WHERE token = $1 AND verified_at IS NULL
	`

	err := r.pool.QueryRow(ctx, query, token).Scan(&userID, &purpose, &expiresAt)
	if err != nil {
		return false, 0, "", err
	}

	// Check if expired
	if time.Now().After(expiresAt) {
		return false, userID, purpose, nil
	}

	return true, userID, purpose, nil
}

// InvalidateUserTokens invalidates all verification tokens for a user with a specific purpose
func (r *EmailVerificationRepository) InvalidateUserTokens(ctx context.Context, userID int, purpose string) error {
	query := `
		DELETE FROM email_verifications
		WHERE user_id = $1 AND purpose = $2 AND verified_at IS NULL
	`

	_, err := r.pool.Exec(ctx, query, userID, purpose)
	return err
}

// GetByToken retrieves a verification record by token
func (r *EmailVerificationRepository) GetByToken(ctx context.Context, token string) (*EmailVerification, error) {
	verification := &EmailVerification{}

	query := `
		SELECT id, user_id, email, token, purpose, expires_at, verified_at, created_at
		FROM email_verifications
		WHERE token = $1
	`

	err := r.pool.QueryRow(ctx, query, token).Scan(
		&verification.ID,
		&verification.UserID,
		&verification.Email,
		&verification.Token,
		&verification.Purpose,
		&verification.ExpiresAt,
		&verification.VerifiedAt,
		&verification.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return verification, nil
}

// GetPendingVerification gets the most recent pending verification for a user
func (r *EmailVerificationRepository) GetPendingVerification(ctx context.Context, userID int, purpose string) (*EmailVerification, error) {
	verification := &EmailVerification{}

	query := `
		SELECT id, user_id, email, token, purpose, expires_at, verified_at, created_at
		FROM email_verifications
		WHERE user_id = $1 AND purpose = $2 AND verified_at IS NULL
		ORDER BY created_at DESC
		LIMIT 1
	`

	err := r.pool.QueryRow(ctx, query, userID, purpose).Scan(
		&verification.ID,
		&verification.UserID,
		&verification.Email,
		&verification.Token,
		&verification.Purpose,
		&verification.ExpiresAt,
		&verification.VerifiedAt,
		&verification.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return verification, nil
}

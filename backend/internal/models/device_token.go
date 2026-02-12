package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DeviceToken represents a push notification token for a user's device
type DeviceToken struct {
	ID         int       `json:"id"`
	UserID     int       `json:"user_id"`
	Token      string    `json:"token"`
	DeviceType string    `json:"device_type"` // 'web', 'ios', 'android'
	DeviceName string    `json:"device_name"`
	LastUsedAt time.Time `json:"last_used_at"`
	CreatedAt  time.Time `json:"created_at"`
}

// DeviceTokenRepository handles CRUD operations for device_tokens
type DeviceTokenRepository struct {
	pool *pgxpool.Pool
}

// NewDeviceTokenRepository creates a new device token repository
func NewDeviceTokenRepository(pool *pgxpool.Pool) *DeviceTokenRepository {
	return &DeviceTokenRepository{pool: pool}
}

// Upsert adds or updates a device token
func (r *DeviceTokenRepository) Upsert(ctx context.Context, dt *DeviceToken) error {
	query := `
		INSERT INTO device_tokens (user_id, token, device_type, device_name, last_used_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (token) DO UPDATE
		SET user_id = EXCLUDED.user_id,
		    device_type = EXCLUDED.device_type,
		    device_name = EXCLUDED.device_name,
		    last_used_at = NOW()
		RETURNING id, last_used_at, created_at
	`

	return r.pool.QueryRow(ctx, query,
		dt.UserID,
		dt.Token,
		dt.DeviceType,
		dt.DeviceName,
	).Scan(&dt.ID, &dt.LastUsedAt, &dt.CreatedAt)
}

// DeleteByUserAndToken removes a specific device token for a user
func (r *DeviceTokenRepository) DeleteByUserAndToken(ctx context.Context, userID int, token string) error {
	query := `DELETE FROM device_tokens WHERE user_id = $1 AND token = $2`
	_, err := r.pool.Exec(ctx, query, userID, token)
	return err
}

// GetByUserID retrieves all registered device tokens for a user
func (r *DeviceTokenRepository) GetByUserID(ctx context.Context, userID int) ([]*DeviceToken, error) {
	query := `
		SELECT id, user_id, token, device_type, device_name, last_used_at, created_at
		FROM device_tokens
		WHERE user_id = $1
		ORDER BY last_used_at DESC
	`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []*DeviceToken
	for rows.Next() {
		dt := &DeviceToken{}
		err := rows.Scan(
			&dt.ID,
			&dt.UserID,
			&dt.Token,
			&dt.DeviceType,
			&dt.DeviceName,
			&dt.LastUsedAt,
			&dt.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		tokens = append(tokens, dt)
	}

	return tokens, nil
}

// UpdateLastUsed updates the last_used_at timestamp for a token
func (r *DeviceTokenRepository) UpdateLastUsed(ctx context.Context, token string) error {
	query := `UPDATE device_tokens SET last_used_at = NOW() WHERE token = $1`
	_, err := r.pool.Exec(ctx, query, token)
	return err
}

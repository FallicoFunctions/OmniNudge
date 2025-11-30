package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserThemeOverride represents a per-page theme customization.
type UserThemeOverride struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	PageName  string    `json:"page_name"` // 'feed', 'profile', 'settings', 'messages', 'notifications', 'search'
	ThemeID   int       `json:"theme_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// UserThemeOverrideRepository handles CRUD operations for user_theme_overrides.
type UserThemeOverrideRepository struct {
	pool *pgxpool.Pool
}

// NewUserThemeOverrideRepository constructs a new repository.
func NewUserThemeOverrideRepository(pool *pgxpool.Pool) *UserThemeOverrideRepository {
	return &UserThemeOverrideRepository{pool: pool}
}

// SetOverride creates or updates a page-specific theme override.
func (r *UserThemeOverrideRepository) SetOverride(ctx context.Context, userID int, pageName string, themeID int) (*UserThemeOverride, error) {
	query := `
		INSERT INTO user_theme_overrides (user_id, page_name, theme_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, page_name) DO UPDATE
		SET theme_id = $3, updated_at = NOW()
		RETURNING id, user_id, page_name, theme_id, created_at, updated_at
	`

	override := &UserThemeOverride{}
	err := r.pool.QueryRow(ctx, query, userID, pageName, themeID).Scan(
		&override.ID,
		&override.UserID,
		&override.PageName,
		&override.ThemeID,
		&override.CreatedAt,
		&override.UpdatedAt,
	)

	return override, err
}

// GetOverride fetches the theme override for a specific page. Returns (nil, nil) if not found.
func (r *UserThemeOverrideRepository) GetOverride(ctx context.Context, userID int, pageName string) (*UserThemeOverride, error) {
	query := `
		SELECT id, user_id, page_name, theme_id, created_at, updated_at
		FROM user_theme_overrides
		WHERE user_id = $1 AND page_name = $2
	`

	override := &UserThemeOverride{}
	err := r.pool.QueryRow(ctx, query, userID, pageName).Scan(
		&override.ID,
		&override.UserID,
		&override.PageName,
		&override.ThemeID,
		&override.CreatedAt,
		&override.UpdatedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return override, nil
}

// GetAllOverrides fetches all page overrides for a user.
func (r *UserThemeOverrideRepository) GetAllOverrides(ctx context.Context, userID int) ([]*UserThemeOverride, error) {
	query := `
		SELECT id, user_id, page_name, theme_id, created_at, updated_at
		FROM user_theme_overrides
		WHERE user_id = $1
		ORDER BY page_name ASC
	`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var overrides []*UserThemeOverride
	for rows.Next() {
		override := &UserThemeOverride{}
		err := rows.Scan(
			&override.ID,
			&override.UserID,
			&override.PageName,
			&override.ThemeID,
			&override.CreatedAt,
			&override.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		overrides = append(overrides, override)
	}

	return overrides, rows.Err()
}

// DeleteOverride removes a page-specific theme override.
func (r *UserThemeOverrideRepository) DeleteOverride(ctx context.Context, userID int, pageName string) error {
	query := `DELETE FROM user_theme_overrides WHERE user_id = $1 AND page_name = $2`
	_, err := r.pool.Exec(ctx, query, userID, pageName)
	return err
}

// DeleteAllOverrides removes all page-specific overrides for a user.
func (r *UserThemeOverrideRepository) DeleteAllOverrides(ctx context.Context, userID int) error {
	query := `DELETE FROM user_theme_overrides WHERE user_id = $1`
	_, err := r.pool.Exec(ctx, query, userID)
	return err
}

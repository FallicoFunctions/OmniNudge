package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserInstalledTheme tracks which users have installed which themes.
type UserInstalledTheme struct {
	ID                 int        `json:"id"`
	UserID             int        `json:"user_id"`
	ThemeID            int        `json:"theme_id"`
	PurchasedAt        time.Time  `json:"purchased_at"`
	PricePaid          int        `json:"price_paid"`
	IsActive           bool       `json:"is_active"`
	InstalledAt        time.Time  `json:"installed_at"`
	LastUsedAt         *time.Time `json:"last_used_at,omitempty"`
	InstalledVersion   *string    `json:"installed_version,omitempty"`
	UpdateAvailable    bool       `json:"update_available"`
	AutoUpdateEnabled  bool       `json:"auto_update_enabled"`
	UserRating         *int       `json:"user_rating,omitempty"` // 1-5 stars
	Review             *string    `json:"review,omitempty"`
	ReviewedAt         *time.Time `json:"reviewed_at,omitempty"`
}

// UserInstalledThemeRepository handles CRUD operations for user_installed_themes.
type UserInstalledThemeRepository struct {
	pool *pgxpool.Pool
}

// NewUserInstalledThemeRepository constructs a new repository.
func NewUserInstalledThemeRepository(pool *pgxpool.Pool) *UserInstalledThemeRepository {
	return &UserInstalledThemeRepository{pool: pool}
}

// Install records a theme installation (purchase/download).
func (r *UserInstalledThemeRepository) Install(ctx context.Context, userID, themeID, pricePaid int) (*UserInstalledTheme, error) {
	query := `
		INSERT INTO user_installed_themes (user_id, theme_id, price_paid)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, theme_id) DO UPDATE
		SET installed_at = NOW()
		RETURNING id, user_id, theme_id, purchased_at, price_paid, is_active, installed_at,
		          last_used_at, installed_version, update_available, auto_update_enabled,
		          user_rating, review, reviewed_at
	`

	installed := &UserInstalledTheme{}
	err := r.pool.QueryRow(ctx, query, userID, themeID, pricePaid).Scan(
		&installed.ID,
		&installed.UserID,
		&installed.ThemeID,
		&installed.PurchasedAt,
		&installed.PricePaid,
		&installed.IsActive,
		&installed.InstalledAt,
		&installed.LastUsedAt,
		&installed.InstalledVersion,
		&installed.UpdateAvailable,
		&installed.AutoUpdateEnabled,
		&installed.UserRating,
		&installed.Review,
		&installed.ReviewedAt,
	)

	return installed, err
}

// GetInstalledTheme checks if a user has installed a specific theme. Returns (nil, nil) if not found.
func (r *UserInstalledThemeRepository) GetInstalledTheme(ctx context.Context, userID, themeID int) (*UserInstalledTheme, error) {
	query := `
		SELECT id, user_id, theme_id, purchased_at, price_paid, is_active, installed_at,
		       last_used_at, installed_version, update_available, auto_update_enabled,
		       user_rating, review, reviewed_at
		FROM user_installed_themes
		WHERE user_id = $1 AND theme_id = $2
	`

	installed := &UserInstalledTheme{}
	err := r.pool.QueryRow(ctx, query, userID, themeID).Scan(
		&installed.ID,
		&installed.UserID,
		&installed.ThemeID,
		&installed.PurchasedAt,
		&installed.PricePaid,
		&installed.IsActive,
		&installed.InstalledAt,
		&installed.LastUsedAt,
		&installed.InstalledVersion,
		&installed.UpdateAvailable,
		&installed.AutoUpdateEnabled,
		&installed.UserRating,
		&installed.Review,
		&installed.ReviewedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return installed, nil
}

// GetUserInstalledThemes fetches all themes installed by a user.
func (r *UserInstalledThemeRepository) GetUserInstalledThemes(ctx context.Context, userID int) ([]*UserInstalledTheme, error) {
	query := `
		SELECT id, user_id, theme_id, purchased_at, price_paid, is_active, installed_at,
		       last_used_at, installed_version, update_available, auto_update_enabled,
		       user_rating, review, reviewed_at
		FROM user_installed_themes
		WHERE user_id = $1
		ORDER BY installed_at DESC
	`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var installed []*UserInstalledTheme
	for rows.Next() {
		item := &UserInstalledTheme{}
		err := rows.Scan(
			&item.ID,
			&item.UserID,
			&item.ThemeID,
			&item.PurchasedAt,
			&item.PricePaid,
			&item.IsActive,
			&item.InstalledAt,
			&item.LastUsedAt,
			&item.InstalledVersion,
			&item.UpdateAvailable,
			&item.AutoUpdateEnabled,
			&item.UserRating,
			&item.Review,
			&item.ReviewedAt,
		)
		if err != nil {
			return nil, err
		}
		installed = append(installed, item)
	}

	return installed, rows.Err()
}

// SetActive marks a theme as the user's active theme (global).
// This also deactivates all other themes for the user.
func (r *UserInstalledThemeRepository) SetActive(ctx context.Context, userID, themeID int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Deactivate all themes for this user
	_, err = tx.Exec(ctx, `UPDATE user_installed_themes SET is_active = false WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}

	// Activate the selected theme
	_, err = tx.Exec(ctx, `
		UPDATE user_installed_themes
		SET is_active = true, last_used_at = NOW()
		WHERE user_id = $1 AND theme_id = $2
	`, userID, themeID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// RateTheme allows a user to rate an installed theme.
func (r *UserInstalledThemeRepository) RateTheme(ctx context.Context, userID, themeID, rating int, review *string) error {
	query := `
		UPDATE user_installed_themes
		SET user_rating = $1, review = $2, reviewed_at = NOW()
		WHERE user_id = $3 AND theme_id = $4
	`

	_, err := r.pool.Exec(ctx, query, rating, review, userID, themeID)
	return err
}

// Uninstall removes a theme installation.
func (r *UserInstalledThemeRepository) Uninstall(ctx context.Context, userID, themeID int) error {
	query := `DELETE FROM user_installed_themes WHERE user_id = $1 AND theme_id = $2`
	_, err := r.pool.Exec(ctx, query, userID, themeID)
	return err
}

// HasInstalled checks if a user has installed a specific theme.
func (r *UserInstalledThemeRepository) HasInstalled(ctx context.Context, userID, themeID int) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM user_installed_themes WHERE user_id = $1 AND theme_id = $2)`

	var exists bool
	err := r.pool.QueryRow(ctx, query, userID, themeID).Scan(&exists)
	return exists, err
}

// GetActiveTheme fetches the user's currently active theme. Returns (nil, nil) if none.
func (r *UserInstalledThemeRepository) GetActiveTheme(ctx context.Context, userID int) (*UserInstalledTheme, error) {
	query := `
		SELECT id, user_id, theme_id, purchased_at, price_paid, is_active, installed_at,
		       last_used_at, installed_version, update_available, auto_update_enabled,
		       user_rating, review, reviewed_at
		FROM user_installed_themes
		WHERE user_id = $1 AND is_active = true
		LIMIT 1
	`

	installed := &UserInstalledTheme{}
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&installed.ID,
		&installed.UserID,
		&installed.ThemeID,
		&installed.PurchasedAt,
		&installed.PricePaid,
		&installed.IsActive,
		&installed.InstalledAt,
		&installed.LastUsedAt,
		&installed.InstalledVersion,
		&installed.UpdateAvailable,
		&installed.AutoUpdateEnabled,
		&installed.UserRating,
		&installed.Review,
		&installed.ReviewedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return installed, nil
}

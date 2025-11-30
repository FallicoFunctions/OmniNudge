package models

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserTheme represents a custom theme created by a user.
type UserTheme struct {
	ID               int                    `json:"id"`
	UserID           int                    `json:"user_id"`
	ThemeName        string                 `json:"theme_name"`
	ThemeDescription *string                `json:"theme_description,omitempty"`
	ThemeType        string                 `json:"theme_type"` // 'predefined', 'variable_customization', 'full_css'
	ScopeType        string                 `json:"scope_type"` // 'global', 'per_page'
	TargetPage       *string                `json:"target_page,omitempty"`
	CSSVariables     map[string]interface{} `json:"css_variables,omitempty"`
	CustomCSS        *string                `json:"custom_css,omitempty"`
	IsPublic         bool                   `json:"is_public"`
	IsMarketplace    bool                   `json:"is_marketplace"`
	PriceCoins       int                    `json:"price_coins"`
	Category         *string                `json:"category,omitempty"`
	Tags             []string               `json:"tags,omitempty"`
	ThumbnailURL     *string                `json:"thumbnail_url,omitempty"`
	InstallCount     int                    `json:"install_count"`
	RatingCount      int                    `json:"rating_count"`
	AverageRating    float64                `json:"average_rating"`
	Version          string                 `json:"version"`
	CreatedAt        time.Time              `json:"created_at"`
	UpdatedAt        time.Time              `json:"updated_at"`
}

// UserThemeRepository handles CRUD operations for user_themes.
type UserThemeRepository struct {
	pool *pgxpool.Pool
}

// NewUserThemeRepository constructs a new repository.
func NewUserThemeRepository(pool *pgxpool.Pool) *UserThemeRepository {
	return &UserThemeRepository{pool: pool}
}

// Create inserts a new theme into the database.
func (r *UserThemeRepository) Create(ctx context.Context, theme *UserTheme) (*UserTheme, error) {
	query := `
		INSERT INTO user_themes (
			user_id, theme_name, theme_description, theme_type, scope_type, target_page,
			css_variables, custom_css, is_public, is_marketplace, price_coins,
			category, tags, thumbnail_url, version
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		RETURNING id, install_count, rating_count, average_rating, created_at, updated_at
	`

	// Convert CSSVariables map to JSONB
	var cssVarsJSON []byte
	var err error
	if theme.CSSVariables != nil {
		cssVarsJSON, err = json.Marshal(theme.CSSVariables)
		if err != nil {
			return nil, err
		}
	}

	err = r.pool.QueryRow(ctx, query,
		theme.UserID,
		theme.ThemeName,
		theme.ThemeDescription,
		theme.ThemeType,
		theme.ScopeType,
		theme.TargetPage,
		cssVarsJSON,
		theme.CustomCSS,
		theme.IsPublic,
		theme.IsMarketplace,
		theme.PriceCoins,
		theme.Category,
		theme.Tags,
		theme.ThumbnailURL,
		theme.Version,
	).Scan(
		&theme.ID,
		&theme.InstallCount,
		&theme.RatingCount,
		&theme.AverageRating,
		&theme.CreatedAt,
		&theme.UpdatedAt,
	)

	return theme, err
}

// GetByID fetches a theme by its ID. Returns (nil, nil) if not found.
func (r *UserThemeRepository) GetByID(ctx context.Context, id int) (*UserTheme, error) {
	query := `
		SELECT id, user_id, theme_name, theme_description, theme_type, scope_type, target_page,
		       css_variables, custom_css, is_public, is_marketplace, price_coins,
		       category, tags, thumbnail_url, install_count, rating_count, average_rating,
		       version, created_at, updated_at
		FROM user_themes
		WHERE id = $1
	`

	theme := &UserTheme{}
	var cssVarsJSON []byte

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&theme.ID,
		&theme.UserID,
		&theme.ThemeName,
		&theme.ThemeDescription,
		&theme.ThemeType,
		&theme.ScopeType,
		&theme.TargetPage,
		&cssVarsJSON,
		&theme.CustomCSS,
		&theme.IsPublic,
		&theme.IsMarketplace,
		&theme.PriceCoins,
		&theme.Category,
		&theme.Tags,
		&theme.ThumbnailURL,
		&theme.InstallCount,
		&theme.RatingCount,
		&theme.AverageRating,
		&theme.Version,
		&theme.CreatedAt,
		&theme.UpdatedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	// Unmarshal CSS variables JSON
	if cssVarsJSON != nil {
		if err := json.Unmarshal(cssVarsJSON, &theme.CSSVariables); err != nil {
			return nil, err
		}
	}

	return theme, nil
}

// GetByUserID fetches all themes created by a specific user.
func (r *UserThemeRepository) GetByUserID(ctx context.Context, userID int, limit, offset int) ([]*UserTheme, error) {
	query := `
		SELECT id, user_id, theme_name, theme_description, theme_type, scope_type, target_page,
		       css_variables, custom_css, is_public, is_marketplace, price_coins,
		       category, tags, thumbnail_url, install_count, rating_count, average_rating,
		       version, created_at, updated_at
		FROM user_themes
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var themes []*UserTheme
	for rows.Next() {
		theme := &UserTheme{}
		var cssVarsJSON []byte

		err := rows.Scan(
			&theme.ID,
			&theme.UserID,
			&theme.ThemeName,
			&theme.ThemeDescription,
			&theme.ThemeType,
			&theme.ScopeType,
			&theme.TargetPage,
			&cssVarsJSON,
			&theme.CustomCSS,
			&theme.IsPublic,
			&theme.IsMarketplace,
			&theme.PriceCoins,
			&theme.Category,
			&theme.Tags,
			&theme.ThumbnailURL,
			&theme.InstallCount,
			&theme.RatingCount,
			&theme.AverageRating,
			&theme.Version,
			&theme.CreatedAt,
			&theme.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		// Unmarshal CSS variables JSON
		if cssVarsJSON != nil {
			if err := json.Unmarshal(cssVarsJSON, &theme.CSSVariables); err != nil {
				return nil, err
			}
		}

		themes = append(themes, theme)
	}

	return themes, rows.Err()
}

// GetPublicThemes fetches all public themes (for browsing).
func (r *UserThemeRepository) GetPublicThemes(ctx context.Context, limit, offset int, category *string) ([]*UserTheme, error) {
	query := `
		SELECT id, user_id, theme_name, theme_description, theme_type, scope_type, target_page,
		       css_variables, custom_css, is_public, is_marketplace, price_coins,
		       category, tags, thumbnail_url, install_count, rating_count, average_rating,
		       version, created_at, updated_at
		FROM user_themes
		WHERE is_public = true
	`

	args := []interface{}{}
	argCount := 0

	if category != nil && *category != "" {
		argCount++
		query += ` AND category = $` + string(rune('0'+argCount))
		args = append(args, *category)
	}

	query += ` ORDER BY install_count DESC, average_rating DESC, created_at DESC`

	argCount++
	query += ` LIMIT $` + string(rune('0'+argCount))
	args = append(args, limit)

	argCount++
	query += ` OFFSET $` + string(rune('0'+argCount))
	args = append(args, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var themes []*UserTheme
	for rows.Next() {
		theme := &UserTheme{}
		var cssVarsJSON []byte

		err := rows.Scan(
			&theme.ID,
			&theme.UserID,
			&theme.ThemeName,
			&theme.ThemeDescription,
			&theme.ThemeType,
			&theme.ScopeType,
			&theme.TargetPage,
			&cssVarsJSON,
			&theme.CustomCSS,
			&theme.IsPublic,
			&theme.IsMarketplace,
			&theme.PriceCoins,
			&theme.Category,
			&theme.Tags,
			&theme.ThumbnailURL,
			&theme.InstallCount,
			&theme.RatingCount,
			&theme.AverageRating,
			&theme.Version,
			&theme.CreatedAt,
			&theme.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		// Unmarshal CSS variables JSON
		if cssVarsJSON != nil {
			if err := json.Unmarshal(cssVarsJSON, &theme.CSSVariables); err != nil {
				return nil, err
			}
		}

		themes = append(themes, theme)
	}

	return themes, rows.Err()
}

// Update modifies an existing theme.
func (r *UserThemeRepository) Update(ctx context.Context, theme *UserTheme) error {
	query := `
		UPDATE user_themes
		SET theme_name = $1, theme_description = $2, theme_type = $3, scope_type = $4,
		    target_page = $5, css_variables = $6, custom_css = $7, is_public = $8,
		    is_marketplace = $9, price_coins = $10, category = $11, tags = $12,
		    thumbnail_url = $13, version = $14, updated_at = NOW()
		WHERE id = $15 AND user_id = $16
	`

	// Convert CSSVariables map to JSONB
	var cssVarsJSON []byte
	var err error
	if theme.CSSVariables != nil {
		cssVarsJSON, err = json.Marshal(theme.CSSVariables)
		if err != nil {
			return err
		}
	}

	_, err = r.pool.Exec(ctx, query,
		theme.ThemeName,
		theme.ThemeDescription,
		theme.ThemeType,
		theme.ScopeType,
		theme.TargetPage,
		cssVarsJSON,
		theme.CustomCSS,
		theme.IsPublic,
		theme.IsMarketplace,
		theme.PriceCoins,
		theme.Category,
		theme.Tags,
		theme.ThumbnailURL,
		theme.Version,
		theme.ID,
		theme.UserID,
	)

	return err
}

// Delete removes a theme (only if user is the owner).
func (r *UserThemeRepository) Delete(ctx context.Context, themeID, userID int) error {
	query := `DELETE FROM user_themes WHERE id = $1 AND user_id = $2`
	_, err := r.pool.Exec(ctx, query, themeID, userID)
	return err
}

// GetPredefinedThemes fetches all predefined (system) themes.
// Predefined themes are created by user_id = 0 or have theme_type = 'predefined'.
func (r *UserThemeRepository) GetPredefinedThemes(ctx context.Context) ([]*UserTheme, error) {
	query := `
		SELECT id, user_id, theme_name, theme_description, theme_type, scope_type, target_page,
		       css_variables, custom_css, is_public, is_marketplace, price_coins,
		       category, tags, thumbnail_url, install_count, rating_count, average_rating,
		       version, created_at, updated_at
		FROM user_themes
		WHERE theme_type = 'predefined'
		ORDER BY theme_name ASC
	`

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var themes []*UserTheme
	for rows.Next() {
		theme := &UserTheme{}
		var cssVarsJSON []byte

		err := rows.Scan(
			&theme.ID,
			&theme.UserID,
			&theme.ThemeName,
			&theme.ThemeDescription,
			&theme.ThemeType,
			&theme.ScopeType,
			&theme.TargetPage,
			&cssVarsJSON,
			&theme.CustomCSS,
			&theme.IsPublic,
			&theme.IsMarketplace,
			&theme.PriceCoins,
			&theme.Category,
			&theme.Tags,
			&theme.ThumbnailURL,
			&theme.InstallCount,
			&theme.RatingCount,
			&theme.AverageRating,
			&theme.Version,
			&theme.CreatedAt,
			&theme.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		// Unmarshal CSS variables JSON
		if cssVarsJSON != nil {
			if err := json.Unmarshal(cssVarsJSON, &theme.CSSVariables); err != nil {
				return nil, err
			}
		}

		themes = append(themes, theme)
	}

	return themes, rows.Err()
}

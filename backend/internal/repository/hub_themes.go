package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
)

type HubThemesRepository struct {
	pool *pgxpool.Pool
}

func NewHubThemesRepository(pool *pgxpool.Pool) *HubThemesRepository {
	return &HubThemesRepository{pool: pool}
}

// GetActiveTheme retrieves the active theme for a hub
func (r *HubThemesRepository) GetActiveTheme(ctx context.Context, hubID int) (*models.HubTheme, error) {
	query := `
		SELECT id, hub_id, name, description, is_active, css_content,
		       apply_to_whole_page, apply_to_header, apply_to_sidebar, apply_to_post_list, apply_to_post_detail,
		       version, parent_version_id, created_at, created_by, updated_at
		FROM hub_themes
		WHERE hub_id = $1 AND is_active = TRUE
	`

	var theme models.HubTheme
	err := r.pool.QueryRow(ctx, query, hubID).Scan(
		&theme.ID, &theme.HubID, &theme.Name, &theme.Description, &theme.IsActive, &theme.CSSContent,
		&theme.ApplyToWholePage, &theme.ApplyToHeader, &theme.ApplyToSidebar, &theme.ApplyToPostList, &theme.ApplyToPostDetail,
		&theme.Version, &theme.ParentVersionID, &theme.CreatedAt, &theme.CreatedBy, &theme.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &theme, nil
}

// GetAllThemes retrieves all themes for a hub (for version history)
func (r *HubThemesRepository) GetAllThemes(ctx context.Context, hubID int) ([]models.HubTheme, error) {
	query := `
		SELECT id, hub_id, name, description, is_active, css_content,
		       apply_to_whole_page, apply_to_header, apply_to_sidebar, apply_to_post_list, apply_to_post_detail,
		       version, parent_version_id, created_at, created_by, updated_at
		FROM hub_themes
		WHERE hub_id = $1
		ORDER BY created_at DESC
	`

	rows, err := r.pool.Query(ctx, query, hubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var themes []models.HubTheme
	for rows.Next() {
		var theme models.HubTheme
		err := rows.Scan(
			&theme.ID, &theme.HubID, &theme.Name, &theme.Description, &theme.IsActive, &theme.CSSContent,
			&theme.ApplyToWholePage, &theme.ApplyToHeader, &theme.ApplyToSidebar, &theme.ApplyToPostList, &theme.ApplyToPostDetail,
			&theme.Version, &theme.ParentVersionID, &theme.CreatedAt, &theme.CreatedBy, &theme.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		themes = append(themes, theme)
	}

	return themes, nil
}

// GetThemeByID retrieves a specific theme by ID
func (r *HubThemesRepository) GetThemeByID(ctx context.Context, themeID int) (*models.HubTheme, error) {
	query := `
		SELECT id, hub_id, name, description, is_active, css_content,
		       apply_to_whole_page, apply_to_header, apply_to_sidebar, apply_to_post_list, apply_to_post_detail,
		       version, parent_version_id, created_at, created_by, updated_at
		FROM hub_themes
		WHERE id = $1
	`

	var theme models.HubTheme
	err := r.pool.QueryRow(ctx, query, themeID).Scan(
		&theme.ID, &theme.HubID, &theme.Name, &theme.Description, &theme.IsActive, &theme.CSSContent,
		&theme.ApplyToWholePage, &theme.ApplyToHeader, &theme.ApplyToSidebar, &theme.ApplyToPostList, &theme.ApplyToPostDetail,
		&theme.Version, &theme.ParentVersionID, &theme.CreatedAt, &theme.CreatedBy, &theme.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &theme, nil
}

// CreateTheme creates a new theme version
func (r *HubThemesRepository) CreateTheme(ctx context.Context, theme *models.HubTheme) (int, error) {
	// Deactivate all existing themes for this hub if this one is active
	if theme.IsActive {
		_, err := r.pool.Exec(ctx, "UPDATE hub_themes SET is_active = FALSE WHERE hub_id = $1", theme.HubID)
		if err != nil {
			return 0, err
		}
	}

	query := `
		INSERT INTO hub_themes (
			hub_id, name, description, is_active, css_content,
			apply_to_whole_page, apply_to_header, apply_to_sidebar, apply_to_post_list, apply_to_post_detail,
			version, parent_version_id, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id
	`

	var id int
	err := r.pool.QueryRow(ctx, query,
		theme.HubID, theme.Name, theme.Description, theme.IsActive, theme.CSSContent,
		theme.ApplyToWholePage, theme.ApplyToHeader, theme.ApplyToSidebar, theme.ApplyToPostList, theme.ApplyToPostDetail,
		theme.Version, theme.ParentVersionID, theme.CreatedBy,
	).Scan(&id)

	return id, err
}

// UpdateTheme updates an existing theme (creates a new version)
func (r *HubThemesRepository) UpdateTheme(ctx context.Context, theme *models.HubTheme, userID int) (int, error) {
	// Get the current theme to use as parent
	currentTheme, err := r.GetThemeByID(ctx, theme.ID)
	if err != nil {
		return 0, err
	}

	// Create new version
	newTheme := *theme
	newTheme.Version = currentTheme.Version + 1
	newTheme.ParentVersionID = &currentTheme.ID
	newTheme.CreatedBy = userID

	return r.CreateTheme(ctx, &newTheme)
}

// ActivateTheme activates a specific theme (deactivates others)
func (r *HubThemesRepository) ActivateTheme(ctx context.Context, themeID int, hubID int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Deactivate all themes for this hub
	_, err = tx.Exec(ctx, "UPDATE hub_themes SET is_active = FALSE WHERE hub_id = $1", hubID)
	if err != nil {
		return err
	}

	// Activate the specified theme
	_, err = tx.Exec(ctx, "UPDATE hub_themes SET is_active = TRUE WHERE id = $1 AND hub_id = $2", themeID, hubID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// DeleteTheme deletes a theme (cannot delete active theme)
func (r *HubThemesRepository) DeleteTheme(ctx context.Context, themeID int) error {
	query := `
		DELETE FROM hub_themes
		WHERE id = $1 AND is_active = FALSE
	`

	result, err := r.pool.Exec(ctx, query, themeID)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return &RepositoryError{Message: "Cannot delete active theme"}
	}

	return nil
}

type RepositoryError struct {
	Message string
}

func (e *RepositoryError) Error() string {
	return e.Message
}

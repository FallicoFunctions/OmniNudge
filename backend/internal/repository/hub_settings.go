package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
)

type HubSettingsRepository struct {
	pool *pgxpool.Pool
}

func NewHubSettingsRepository(pool *pgxpool.Pool) *HubSettingsRepository {
	return &HubSettingsRepository{pool: pool}
}

// GetHubIDByName retrieves hub ID by name
func (r *HubSettingsRepository) GetHubIDByName(ctx context.Context, hubName string) (int, error) {
	var hubID int
	err := r.pool.QueryRow(ctx, "SELECT id FROM hubs WHERE name = $1", hubName).Scan(&hubID)
	return hubID, err
}

// GetByHubID retrieves settings for a hub
func (r *HubSettingsRepository) GetByHubID(ctx context.Context, hubID int) (*models.HubSettings, error) {
	query := `
		SELECT id, hub_id, display_title, sidebar_markdown, privacy_type,
		       allow_text_posts, allow_link_posts, allow_image_posts, allow_video_posts, allow_poll_posts,
		       allow_media_in_comments, require_post_flair,
		       banned_words, spam_filter_strength, new_account_filter_days, min_account_karma,
		       allow_spoilers, show_thumbnails, enable_wiki,
		       updated_at, updated_by
		FROM hub_settings
		WHERE hub_id = $1
	`

	var settings models.HubSettings
	err := r.pool.QueryRow(ctx, query, hubID).Scan(
		&settings.ID, &settings.HubID, &settings.DisplayTitle, &settings.SidebarMarkdown, &settings.PrivacyType,
		&settings.AllowTextPosts, &settings.AllowLinkPosts, &settings.AllowImagePosts, &settings.AllowVideoPosts, &settings.AllowPollPosts,
		&settings.AllowMediaInComments, &settings.RequirePostFlair,
		&settings.BannedWords, &settings.SpamFilterStrength, &settings.NewAccountFilterDays, &settings.MinAccountKarma,
		&settings.AllowSpoilers, &settings.ShowThumbnails, &settings.EnableWiki,
		&settings.UpdatedAt, &settings.UpdatedBy,
	)
	if err != nil {
		return nil, err
	}

	return &settings, nil
}

// Update updates hub settings
func (r *HubSettingsRepository) Update(ctx context.Context, settings *models.HubSettings, userID int) error {
	query := `
		UPDATE hub_settings
		SET display_title = $2,
		    sidebar_markdown = $3,
		    privacy_type = $4,
		    allow_text_posts = $5,
		    allow_link_posts = $6,
		    allow_image_posts = $7,
		    allow_video_posts = $8,
		    allow_poll_posts = $9,
		    allow_media_in_comments = $10,
		    require_post_flair = $11,
		    banned_words = $12,
		    spam_filter_strength = $13,
		    new_account_filter_days = $14,
		    min_account_karma = $15,
		    allow_spoilers = $16,
		    show_thumbnails = $17,
		    enable_wiki = $18,
		    updated_at = CURRENT_TIMESTAMP,
		    updated_by = $19
		WHERE hub_id = $1
	`

	_, err := r.pool.Exec(ctx, query,
		settings.HubID,
		settings.DisplayTitle,
		settings.SidebarMarkdown,
		settings.PrivacyType,
		settings.AllowTextPosts,
		settings.AllowLinkPosts,
		settings.AllowImagePosts,
		settings.AllowVideoPosts,
		settings.AllowPollPosts,
		settings.AllowMediaInComments,
		settings.RequirePostFlair,
		settings.BannedWords,
		settings.SpamFilterStrength,
		settings.NewAccountFilterDays,
		settings.MinAccountKarma,
		settings.AllowSpoilers,
		settings.ShowThumbnails,
		settings.EnableWiki,
		userID,
	)

	return err
}

// GetModeratorRole gets a user's moderator role for a hub
func (r *HubSettingsRepository) GetModeratorRole(ctx context.Context, hubID int, userID int) (*models.ModeratorRole, error) {
	query := `
		SELECT role
		FROM hub_moderators
		WHERE hub_id = $1 AND user_id = $2
	`

	var role models.ModeratorRole
	err := r.pool.QueryRow(ctx, query, hubID, userID).Scan(&role)
	if err != nil {
		return nil, err
	}

	return &role, nil
}

// GetHubModerators retrieves all moderators for a hub with their roles
func (r *HubSettingsRepository) GetHubModerators(ctx context.Context, hubID int) ([]models.HubModerator, error) {
	query := `
		SELECT hm.id, hm.hub_id, hm.user_id, hm.role, u.username, u.avatar_url
		FROM hub_moderators hm
		JOIN users u ON hm.user_id = u.id
		WHERE hm.hub_id = $1
		ORDER BY
		    CASE hm.role
		        WHEN 'owner' THEN 1
		        WHEN 'full_moderator' THEN 2
		        WHEN 'moderator' THEN 3
		    END,
		    u.username
	`

	rows, err := r.pool.Query(ctx, query, hubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var moderators []models.HubModerator
	for rows.Next() {
		var mod models.HubModerator
		err := rows.Scan(&mod.ID, &mod.HubID, &mod.UserID, &mod.Role, &mod.Username, &mod.AvatarURL)
		if err != nil {
			return nil, err
		}
		moderators = append(moderators, mod)
	}

	return moderators, nil
}

// UpdateModeratorRole updates a moderator's role (only owner can do this)
func (r *HubSettingsRepository) UpdateModeratorRole(ctx context.Context, hubID int, targetUserID int, newRole models.ModeratorRole) error {
	query := `
		UPDATE hub_moderators
		SET role = $1
		WHERE hub_id = $2 AND user_id = $3
	`

	_, err := r.pool.Exec(ctx, query, newRole, hubID, targetUserID)
	return err
}

// AddModerator adds a new moderator to a hub
func (r *HubSettingsRepository) AddModerator(ctx context.Context, hubID int, userID int, role models.ModeratorRole) error {
	query := `
		INSERT INTO hub_moderators (hub_id, user_id, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (hub_id, user_id) DO UPDATE SET role = $3
	`

	_, err := r.pool.Exec(ctx, query, hubID, userID, role)
	return err
}

// RemoveModerator removes a moderator from a hub
func (r *HubSettingsRepository) RemoveModerator(ctx context.Context, hubID int, userID int) error {
	query := `
		DELETE FROM hub_moderators
		WHERE hub_id = $1 AND user_id = $2 AND role != 'owner'
	`

	_, err := r.pool.Exec(ctx, query, hubID, userID)
	return err
}

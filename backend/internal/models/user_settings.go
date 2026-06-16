package models

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserSettings represents per-user preferences for the platform.
type UserSettings struct {
	UserID                       int    `json:"user_id"`
	NotificationSound            bool   `json:"notification_sound"`
	ShowReadReceipts             bool   `json:"show_read_receipts"`
	ShowTypingIndicators         bool   `json:"show_typing_indicators"`
	ShowLastSeen                 bool   `json:"show_last_seen"`
	ProfileVisibility            string `json:"profile_visibility"`
	WallPostPermission           string `json:"wall_post_permission"`
	ShowPushNotifications        bool   `json:"show_push_notifications"` // P0-042: Push notification preference
	AutoAppendInvitation         bool   `json:"auto_append_invitation"`
	Theme                        string `json:"theme"`
	UseRelativeTime              bool   `json:"use_relative_time"`
	AutoCloseThemeSelector       bool   `json:"auto_close_theme_selector"`
	NotifyArchivedMessages       bool   `json:"notify_archived_messages"`
	AutoUnarchiveOnMessage       bool   `json:"auto_unarchive_on_message"`
	NotifyRemovedSavedPosts      bool   `json:"notify_removed_saved_posts"`
	DefaultOmniPostsOnly         bool   `json:"default_omni_posts_only"`
	StayOnPostAfterHide          bool   `json:"stay_on_post_after_hide"`
	UseInfiniteScrollHome        bool   `json:"use_infinite_scroll_home"`
	UseInfiniteScrollHubs        bool   `json:"use_infinite_scroll_hubs"`
	UseInfiniteScrollSubs        bool   `json:"use_infinite_scroll_subs"`
	UseInfiniteScroll            bool   `json:"use_infinite_scroll"`
	SearchIncludeNsfwByDefault   bool   `json:"search_include_nsfw_by_default"`
	BlockAllNsfw                 bool   `json:"block_all_nsfw"`
	BlockNsfwThumbnails          bool   `json:"block_nsfw_thumbnails"`
	AccessRequestCooldownDisplay string `json:"access_request_cooldown_display"`
	FontSize                     string `json:"font_size"`
	TranscriptionOptIn           bool   `json:"transcription_opt_in"`
	MicDeviceID                  string `json:"mic_device_id"`
	CameraDeviceID               string `json:"camera_device_id"`
	SpeakerDeviceID              string `json:"speaker_device_id"`
	QuietHoursEnabled            bool   `json:"quiet_hours_enabled"`
	QuietHoursStartMinutes       int    `json:"quiet_hours_start_minutes"`
	QuietHoursEndMinutes         int    `json:"quiet_hours_end_minutes"`
	QuietHoursTimezone           string `json:"quiet_hours_timezone"`
	BatchNotifications           bool   `json:"batch_notifications"`

	// Notification preferences
	NotifyCommentReplies   bool `json:"notify_comment_replies"`
	NotifyPostMilestone    bool `json:"notify_post_milestone"`
	NotifyPostVelocity     bool `json:"notify_post_velocity"`
	NotifyCommentMilestone bool `json:"notify_comment_milestone"`
	NotifyCommentVelocity  bool `json:"notify_comment_velocity"`
	DailyDigest            bool `json:"daily_digest"`

	// Media gallery preferences
	MediaGalleryFilter string `json:"media_gallery_filter"` // 'all', 'mine', 'theirs'

	// Theme customization preferences (Phase 2)
	ActiveThemeID       *int `json:"active_theme_id,omitempty"`
	AdvancedModeEnabled bool `json:"advanced_mode_enabled"`

	// Auto-delete: nil means Never (default)
	DefaultAutoDeleteAfter *time.Duration `json:"default_auto_delete_after,omitempty"`

	UpdatedAt time.Time `json:"updated_at"`
}

// UserSettingsRepository handles CRUD for user_settings.
type UserSettingsRepository struct {
	pool *pgxpool.Pool
}

// NewUserSettingsRepository constructs a new repository.
func NewUserSettingsRepository(pool *pgxpool.Pool) *UserSettingsRepository {
	return &UserSettingsRepository{pool: pool}
}

// GetByUserID fetches settings for a user. Returns (nil, nil) if not found.
func (r *UserSettingsRepository) GetByUserID(ctx context.Context, userID int) (*UserSettings, error) {
	query := `
		SELECT user_id, notification_sound, show_read_receipts, show_typing_indicators, show_last_seen,
		       profile_visibility, wall_post_permission,
		       show_push_notifications, auto_append_invitation, theme,
		       use_relative_time, auto_close_theme_selector,
		       notify_archived_messages, auto_unarchive_on_message, notify_removed_saved_posts,
		       default_omni_posts_only, stay_on_post_after_hide,
		       use_infinite_scroll_home, use_infinite_scroll_hubs, use_infinite_scroll_subs, use_infinite_scroll,
		       search_include_nsfw_by_default, block_all_nsfw, block_nsfw_thumbnails,
		       access_request_cooldown_display, font_size, transcription_opt_in,
		       mic_device_id, camera_device_id, speaker_device_id,
		       quiet_hours_enabled, quiet_hours_start_minutes, quiet_hours_end_minutes, quiet_hours_timezone,
		       batch_notifications,
		       notify_comment_replies, notify_post_milestone, notify_post_velocity,
		       notify_comment_milestone, notify_comment_velocity, daily_digest,
		       media_gallery_filter, active_theme_id, advanced_mode_enabled,
		       default_auto_delete_after, updated_at
		FROM user_settings
		WHERE user_id = $1
	`

	settings := &UserSettings{}
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&settings.UserID,
		&settings.NotificationSound,
		&settings.ShowReadReceipts,
		&settings.ShowTypingIndicators,
		&settings.ShowLastSeen,
		&settings.ProfileVisibility,
		&settings.WallPostPermission,
		&settings.ShowPushNotifications,
		&settings.AutoAppendInvitation,
		&settings.Theme,
		&settings.UseRelativeTime,
		&settings.AutoCloseThemeSelector,
		&settings.NotifyArchivedMessages,
		&settings.AutoUnarchiveOnMessage,
		&settings.NotifyRemovedSavedPosts,
		&settings.DefaultOmniPostsOnly,
		&settings.StayOnPostAfterHide,
		&settings.UseInfiniteScrollHome,
		&settings.UseInfiniteScrollHubs,
		&settings.UseInfiniteScrollSubs,
		&settings.UseInfiniteScroll,
		&settings.SearchIncludeNsfwByDefault,
		&settings.BlockAllNsfw,
		&settings.BlockNsfwThumbnails,
		&settings.AccessRequestCooldownDisplay,
		&settings.FontSize,
		&settings.TranscriptionOptIn,
		&settings.MicDeviceID,
		&settings.CameraDeviceID,
		&settings.SpeakerDeviceID,
		&settings.QuietHoursEnabled,
		&settings.QuietHoursStartMinutes,
		&settings.QuietHoursEndMinutes,
		&settings.QuietHoursTimezone,
		&settings.BatchNotifications,
		&settings.NotifyCommentReplies,
		&settings.NotifyPostMilestone,
		&settings.NotifyPostVelocity,
		&settings.NotifyCommentMilestone,
		&settings.NotifyCommentVelocity,
		&settings.DailyDigest,
		&settings.MediaGalleryFilter,
		&settings.ActiveThemeID,
		&settings.AdvancedModeEnabled,
		&settings.DefaultAutoDeleteAfter,
		&settings.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return settings, nil
}

// CreateDefault inserts default settings for a user if none exist.
func (r *UserSettingsRepository) CreateDefault(ctx context.Context, userID int) (*UserSettings, error) {
	query := `
		INSERT INTO user_settings (user_id, theme)
		VALUES ($1, 'system')
		ON CONFLICT (user_id) DO NOTHING
		RETURNING user_id, notification_sound, show_read_receipts, show_typing_indicators, show_last_seen,
		          profile_visibility, wall_post_permission,
		          show_push_notifications, auto_append_invitation, theme,
		          use_relative_time, auto_close_theme_selector,
		          notify_archived_messages, auto_unarchive_on_message, notify_removed_saved_posts,
		          default_omni_posts_only, stay_on_post_after_hide,
		          use_infinite_scroll_home, use_infinite_scroll_hubs, use_infinite_scroll_subs, use_infinite_scroll,
		          search_include_nsfw_by_default, block_all_nsfw, block_nsfw_thumbnails,
		          access_request_cooldown_display, font_size, transcription_opt_in,
		          mic_device_id, camera_device_id, speaker_device_id,
		          quiet_hours_enabled, quiet_hours_start_minutes, quiet_hours_end_minutes, quiet_hours_timezone,
		          batch_notifications,
		          notify_comment_replies, notify_post_milestone, notify_post_velocity,
		          notify_comment_milestone, notify_comment_velocity, daily_digest,
		          media_gallery_filter, active_theme_id, advanced_mode_enabled,
		          default_auto_delete_after, updated_at
	`

	settings := &UserSettings{}
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&settings.UserID,
		&settings.NotificationSound,
		&settings.ShowReadReceipts,
		&settings.ShowTypingIndicators,
		&settings.ShowLastSeen,
		&settings.ProfileVisibility,
		&settings.WallPostPermission,
		&settings.ShowPushNotifications,
		&settings.AutoAppendInvitation,
		&settings.Theme,
		&settings.UseRelativeTime,
		&settings.AutoCloseThemeSelector,
		&settings.NotifyArchivedMessages,
		&settings.AutoUnarchiveOnMessage,
		&settings.NotifyRemovedSavedPosts,
		&settings.DefaultOmniPostsOnly,
		&settings.StayOnPostAfterHide,
		&settings.UseInfiniteScrollHome,
		&settings.UseInfiniteScrollHubs,
		&settings.UseInfiniteScrollSubs,
		&settings.UseInfiniteScroll,
		&settings.SearchIncludeNsfwByDefault,
		&settings.BlockAllNsfw,
		&settings.BlockNsfwThumbnails,
		&settings.AccessRequestCooldownDisplay,
		&settings.FontSize,
		&settings.TranscriptionOptIn,
		&settings.MicDeviceID,
		&settings.CameraDeviceID,
		&settings.SpeakerDeviceID,
		&settings.QuietHoursEnabled,
		&settings.QuietHoursStartMinutes,
		&settings.QuietHoursEndMinutes,
		&settings.QuietHoursTimezone,
		&settings.BatchNotifications,
		&settings.NotifyCommentReplies,
		&settings.NotifyPostMilestone,
		&settings.NotifyPostVelocity,
		&settings.NotifyCommentMilestone,
		&settings.NotifyCommentVelocity,
		&settings.DailyDigest,
		&settings.MediaGalleryFilter,
		&settings.ActiveThemeID,
		&settings.AdvancedModeEnabled,
		&settings.DefaultAutoDeleteAfter,
		&settings.UpdatedAt,
	)

	if err != nil {
		// If settings already exist, fetch them.
		if errors.Is(err, pgx.ErrNoRows) {
			return r.GetByUserID(ctx, userID)
		}
		return nil, err
	}

	return settings, nil
}

// Update replaces settings for a user and returns the updated row.
func (r *UserSettingsRepository) Update(ctx context.Context, settings *UserSettings) (*UserSettings, error) {
	query := `
		UPDATE user_settings
		SET notification_sound = $2,
		    show_read_receipts = $3,
		    show_typing_indicators = $4,
		    show_last_seen = $5,
		    profile_visibility = $6,
		    show_push_notifications = $7,
		    auto_append_invitation = $8,
		    theme = $9,
		    use_relative_time = $10,
		    auto_close_theme_selector = $11,
		    notify_archived_messages = $12,
		    auto_unarchive_on_message = $13,
		    notify_removed_saved_posts = $14,
		    default_omni_posts_only = $15,
		    stay_on_post_after_hide = $16,
		    use_infinite_scroll_home = $17,
		    use_infinite_scroll_hubs = $18,
		    use_infinite_scroll_subs = $19,
		    use_infinite_scroll = $20,
		    search_include_nsfw_by_default = $21,
		    block_all_nsfw = $22,
		    block_nsfw_thumbnails = $23,
		    access_request_cooldown_display = $24,
		    font_size = $25,
		    transcription_opt_in = $26,
		    mic_device_id = $27,
		    camera_device_id = $28,
		    speaker_device_id = $29,
		    quiet_hours_enabled = $30,
		    quiet_hours_start_minutes = $31,
		    quiet_hours_end_minutes = $32,
		    quiet_hours_timezone = $33,
		    batch_notifications = $34,
		    notify_comment_replies = $35,
		    notify_post_milestone = $36,
		    notify_post_velocity = $37,
		    notify_comment_milestone = $38,
		    notify_comment_velocity = $39,
		    daily_digest = $40,
		    media_gallery_filter = $41,
		    active_theme_id = $42,
		    advanced_mode_enabled = $43,
		    wall_post_permission = $44,
		    updated_at = CURRENT_TIMESTAMP
		WHERE user_id = $1
		RETURNING user_id, notification_sound, show_read_receipts, show_typing_indicators, show_last_seen,
		          profile_visibility, wall_post_permission,
		          show_push_notifications, auto_append_invitation, theme,
		          use_relative_time, auto_close_theme_selector,
		          notify_archived_messages, auto_unarchive_on_message, notify_removed_saved_posts,
		          default_omni_posts_only, stay_on_post_after_hide,
		          use_infinite_scroll_home, use_infinite_scroll_hubs, use_infinite_scroll_subs, use_infinite_scroll,
		          search_include_nsfw_by_default, block_all_nsfw, block_nsfw_thumbnails,
		          access_request_cooldown_display, font_size, transcription_opt_in,
		          mic_device_id, camera_device_id, speaker_device_id,
		          quiet_hours_enabled, quiet_hours_start_minutes, quiet_hours_end_minutes, quiet_hours_timezone,
		          batch_notifications,
		          notify_comment_replies, notify_post_milestone, notify_post_velocity,
		          notify_comment_milestone, notify_comment_velocity, daily_digest,
		          media_gallery_filter, active_theme_id, advanced_mode_enabled,
		          default_auto_delete_after, updated_at
	`

	updated := &UserSettings{}
	err := r.pool.QueryRow(ctx, query,
		settings.UserID,
		settings.NotificationSound,
		settings.ShowReadReceipts,
		settings.ShowTypingIndicators,
		settings.ShowLastSeen,
		settings.ProfileVisibility,
		settings.ShowPushNotifications,
		settings.AutoAppendInvitation,
		settings.Theme,
		settings.UseRelativeTime,
		settings.AutoCloseThemeSelector,
		settings.NotifyArchivedMessages,
		settings.AutoUnarchiveOnMessage,
		settings.NotifyRemovedSavedPosts,
		settings.DefaultOmniPostsOnly,
		settings.StayOnPostAfterHide,
		settings.UseInfiniteScrollHome,
		settings.UseInfiniteScrollHubs,
		settings.UseInfiniteScrollSubs,
		settings.UseInfiniteScroll,
		settings.SearchIncludeNsfwByDefault,
		settings.BlockAllNsfw,
		settings.BlockNsfwThumbnails,
		settings.AccessRequestCooldownDisplay,
		settings.FontSize,
		settings.TranscriptionOptIn,
		settings.MicDeviceID,
		settings.CameraDeviceID,
		settings.SpeakerDeviceID,
		settings.QuietHoursEnabled,
		settings.QuietHoursStartMinutes,
		settings.QuietHoursEndMinutes,
		settings.QuietHoursTimezone,
		settings.BatchNotifications,
		settings.NotifyCommentReplies,
		settings.NotifyPostMilestone,
		settings.NotifyPostVelocity,
		settings.NotifyCommentMilestone,
		settings.NotifyCommentVelocity,
		settings.DailyDigest,
		settings.MediaGalleryFilter,
		settings.ActiveThemeID,
		settings.AdvancedModeEnabled,
		settings.WallPostPermission,
	).Scan(
		&updated.UserID,
		&updated.NotificationSound,
		&updated.ShowReadReceipts,
		&updated.ShowTypingIndicators,
		&updated.ShowLastSeen,
		&updated.ProfileVisibility,
		&updated.WallPostPermission,
		&updated.ShowPushNotifications,
		&updated.AutoAppendInvitation,
		&updated.Theme,
		&updated.UseRelativeTime,
		&updated.AutoCloseThemeSelector,
		&updated.NotifyArchivedMessages,
		&updated.AutoUnarchiveOnMessage,
		&updated.NotifyRemovedSavedPosts,
		&updated.DefaultOmniPostsOnly,
		&updated.StayOnPostAfterHide,
		&updated.UseInfiniteScrollHome,
		&updated.UseInfiniteScrollHubs,
		&updated.UseInfiniteScrollSubs,
		&updated.UseInfiniteScroll,
		&updated.SearchIncludeNsfwByDefault,
		&updated.BlockAllNsfw,
		&updated.BlockNsfwThumbnails,
		&updated.AccessRequestCooldownDisplay,
		&updated.FontSize,
		&updated.TranscriptionOptIn,
		&updated.MicDeviceID,
		&updated.CameraDeviceID,
		&updated.SpeakerDeviceID,
		&updated.QuietHoursEnabled,
		&updated.QuietHoursStartMinutes,
		&updated.QuietHoursEndMinutes,
		&updated.QuietHoursTimezone,
		&updated.BatchNotifications,
		&updated.NotifyCommentReplies,
		&updated.NotifyPostMilestone,
		&updated.NotifyPostVelocity,
		&updated.NotifyCommentMilestone,
		&updated.NotifyCommentVelocity,
		&updated.DailyDigest,
		&updated.MediaGalleryFilter,
		&updated.ActiveThemeID,
		&updated.AdvancedModeEnabled,
		&updated.DefaultAutoDeleteAfter,
		&updated.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return updated, nil
}

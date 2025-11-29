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
	UserID               int       `json:"user_id"`
	NotificationSound    bool      `json:"notification_sound"`
	ShowReadReceipts     bool      `json:"show_read_receipts"`
	ShowTypingIndicators bool      `json:"show_typing_indicators"`
	AutoAppendInvitation bool      `json:"auto_append_invitation"`
	Theme                string    `json:"theme"`

	// Notification preferences
	NotifyCommentReplies   bool `json:"notify_comment_replies"`
	NotifyPostMilestone    bool `json:"notify_post_milestone"`
	NotifyPostVelocity     bool `json:"notify_post_velocity"`
	NotifyCommentMilestone bool `json:"notify_comment_milestone"`
	NotifyCommentVelocity  bool `json:"notify_comment_velocity"`
	DailyDigest            bool `json:"daily_digest"`

	// Media gallery preferences
	MediaGalleryFilter string `json:"media_gallery_filter"` // 'all', 'mine', 'theirs'

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
		SELECT user_id, notification_sound, show_read_receipts, show_typing_indicators,
		       auto_append_invitation, theme,
		       notify_comment_replies, notify_post_milestone, notify_post_velocity,
		       notify_comment_milestone, notify_comment_velocity, daily_digest,
		       media_gallery_filter, updated_at
		FROM user_settings
		WHERE user_id = $1
	`

	settings := &UserSettings{}
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&settings.UserID,
		&settings.NotificationSound,
		&settings.ShowReadReceipts,
		&settings.ShowTypingIndicators,
		&settings.AutoAppendInvitation,
		&settings.Theme,
		&settings.NotifyCommentReplies,
		&settings.NotifyPostMilestone,
		&settings.NotifyPostVelocity,
		&settings.NotifyCommentMilestone,
		&settings.NotifyCommentVelocity,
		&settings.DailyDigest,
		&settings.MediaGalleryFilter,
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
		INSERT INTO user_settings (user_id)
		VALUES ($1)
		ON CONFLICT (user_id) DO NOTHING
		RETURNING user_id, notification_sound, show_read_receipts, show_typing_indicators,
		          auto_append_invitation, theme,
		          notify_comment_replies, notify_post_milestone, notify_post_velocity,
		          notify_comment_milestone, notify_comment_velocity, daily_digest,
		          media_gallery_filter, updated_at
	`

	settings := &UserSettings{}
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&settings.UserID,
		&settings.NotificationSound,
		&settings.ShowReadReceipts,
		&settings.ShowTypingIndicators,
		&settings.AutoAppendInvitation,
		&settings.Theme,
		&settings.NotifyCommentReplies,
		&settings.NotifyPostMilestone,
		&settings.NotifyPostVelocity,
		&settings.NotifyCommentMilestone,
		&settings.NotifyCommentVelocity,
		&settings.DailyDigest,
		&settings.MediaGalleryFilter,
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
		    auto_append_invitation = $5,
		    theme = $6,
		    notify_comment_replies = $7,
		    notify_post_milestone = $8,
		    notify_post_velocity = $9,
		    notify_comment_milestone = $10,
		    notify_comment_velocity = $11,
		    daily_digest = $12,
		    media_gallery_filter = $13,
		    updated_at = CURRENT_TIMESTAMP
		WHERE user_id = $1
		RETURNING user_id, notification_sound, show_read_receipts, show_typing_indicators,
		          auto_append_invitation, theme,
		          notify_comment_replies, notify_post_milestone, notify_post_velocity,
		          notify_comment_milestone, notify_comment_velocity, daily_digest,
		          media_gallery_filter, updated_at
	`

	updated := &UserSettings{}
	err := r.pool.QueryRow(ctx, query,
		settings.UserID,
		settings.NotificationSound,
		settings.ShowReadReceipts,
		settings.ShowTypingIndicators,
		settings.AutoAppendInvitation,
		settings.Theme,
		settings.NotifyCommentReplies,
		settings.NotifyPostMilestone,
		settings.NotifyPostVelocity,
		settings.NotifyCommentMilestone,
		settings.NotifyCommentVelocity,
		settings.DailyDigest,
		settings.MediaGalleryFilter,
	).Scan(
		&updated.UserID,
		&updated.NotificationSound,
		&updated.ShowReadReceipts,
		&updated.ShowTypingIndicators,
		&updated.AutoAppendInvitation,
		&updated.Theme,
		&updated.NotifyCommentReplies,
		&updated.NotifyPostMilestone,
		&updated.NotifyPostVelocity,
		&updated.NotifyCommentMilestone,
		&updated.NotifyCommentVelocity,
		&updated.DailyDigest,
		&updated.MediaGalleryFilter,
		&updated.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return updated, nil
}

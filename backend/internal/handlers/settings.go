package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
)

// SettingsHandler handles user settings endpoints.
type SettingsHandler struct {
	settingsRepo *models.UserSettingsRepository
}

// NewSettingsHandler constructs a settings handler.
func NewSettingsHandler(settingsRepo *models.UserSettingsRepository) *SettingsHandler {
	return &SettingsHandler{
		settingsRepo: settingsRepo,
	}
}

// GetSettings returns the current user's settings, creating defaults if needed.
func (h *SettingsHandler) GetSettings(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	settings, err := h.getOrCreateSettings(c, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load settings"})
		return
	}

	c.JSON(http.StatusOK, settings)
}

type updateSettingsRequest struct {
	NotificationSound            *bool   `json:"notification_sound"`
	ShowReadReceipts             *bool   `json:"show_read_receipts"`
	ShowTypingIndicators         *bool   `json:"show_typing_indicators"`
	ShowLastSeen                 *bool   `json:"show_last_seen"`
	ProfileVisibility            *string `json:"profile_visibility"`
	ShowPushNotifications        *bool   `json:"show_push_notifications"` // P0-042
	AutoAppendInvitation         *bool   `json:"auto_append_invitation"`
	Theme                        *string `json:"theme"`
	UseRelativeTime              *bool   `json:"use_relative_time"`
	AutoCloseThemeSelector       *bool   `json:"auto_close_theme_selector"`
	NotifyArchivedMessages       *bool   `json:"notify_archived_messages"`
	AutoUnarchiveOnMessage       *bool   `json:"auto_unarchive_on_message"`
	NotifyRemovedSavedPosts      *bool   `json:"notify_removed_saved_posts"`
	DefaultOmniPostsOnly         *bool   `json:"default_omni_posts_only"`
	StayOnPostAfterHide          *bool   `json:"stay_on_post_after_hide"`
	UseInfiniteScrollHome        *bool   `json:"use_infinite_scroll_home"`
	UseInfiniteScrollHubs        *bool   `json:"use_infinite_scroll_hubs"`
	UseInfiniteScrollSubs        *bool   `json:"use_infinite_scroll_subs"`
	UseInfiniteScroll            *bool   `json:"use_infinite_scroll"`
	SearchIncludeNsfwByDefault   *bool   `json:"search_include_nsfw_by_default"`
	BlockAllNsfw                 *bool   `json:"block_all_nsfw"`
	BlockNsfwThumbnails          *bool   `json:"block_nsfw_thumbnails"`
	AccessRequestCooldownDisplay *string `json:"access_request_cooldown_display"`
	FontSize                     *string `json:"font_size"`
	TranscriptionOptIn           *bool   `json:"transcription_opt_in"`
	MicDeviceID                  *string `json:"mic_device_id"`
	CameraDeviceID               *string `json:"camera_device_id"`
	SpeakerDeviceID              *string `json:"speaker_device_id"`
	QuietHoursEnabled            *bool   `json:"quiet_hours_enabled"`
	QuietHoursStartMinutes       *int    `json:"quiet_hours_start_minutes"`
	QuietHoursEndMinutes         *int    `json:"quiet_hours_end_minutes"`
	QuietHoursTimezone           *string `json:"quiet_hours_timezone"`
	BatchNotifications           *bool   `json:"batch_notifications"`

	// Notification preferences
	NotifyCommentReplies   *bool `json:"notify_comment_replies"`
	NotifyPostMilestone    *bool `json:"notify_post_milestone"`
	NotifyPostVelocity     *bool `json:"notify_post_velocity"`
	NotifyCommentMilestone *bool `json:"notify_comment_milestone"`
	NotifyCommentVelocity  *bool `json:"notify_comment_velocity"`
	DailyDigest            *bool `json:"daily_digest"`
}

// UpdateSettings updates the current user's settings.
func (h *SettingsHandler) UpdateSettings(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	var req updateSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	settings, err := h.getOrCreateSettings(c, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load settings"})
		return
	}

	if req.NotificationSound != nil {
		settings.NotificationSound = *req.NotificationSound
	}
	if req.ShowReadReceipts != nil {
		settings.ShowReadReceipts = *req.ShowReadReceipts
	}
	if req.ShowTypingIndicators != nil {
		settings.ShowTypingIndicators = *req.ShowTypingIndicators
	}
	if req.ShowLastSeen != nil {
		settings.ShowLastSeen = *req.ShowLastSeen
	}
	if req.ProfileVisibility != nil {
		v := strings.ToLower(strings.TrimSpace(*req.ProfileVisibility))
		switch v {
		case "public", "friends_only", "private":
			settings.ProfileVisibility = v
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid profile_visibility"})
			return
		}
	}
	if req.ShowPushNotifications != nil {
		settings.ShowPushNotifications = *req.ShowPushNotifications
	}
	if req.AutoAppendInvitation != nil {
		settings.AutoAppendInvitation = *req.AutoAppendInvitation
	}
	if req.Theme != nil {
		theme := strings.ToLower(strings.TrimSpace(*req.Theme))
		if theme == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Theme cannot be empty"})
			return
		}
		if theme == "auto" {
			theme = "system"
		}

		allowedThemes := map[string]bool{
			"dark":   true,
			"light":  true,
			"system": true,
		}
		if !allowedThemes[theme] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme"})
			return
		}
		settings.Theme = theme
	}
	if req.UseRelativeTime != nil {
		settings.UseRelativeTime = *req.UseRelativeTime
	}
	if req.AutoCloseThemeSelector != nil {
		settings.AutoCloseThemeSelector = *req.AutoCloseThemeSelector
	}
	if req.NotifyArchivedMessages != nil {
		settings.NotifyArchivedMessages = *req.NotifyArchivedMessages
	}
	if req.AutoUnarchiveOnMessage != nil {
		settings.AutoUnarchiveOnMessage = *req.AutoUnarchiveOnMessage
	}
	if req.NotifyRemovedSavedPosts != nil {
		settings.NotifyRemovedSavedPosts = *req.NotifyRemovedSavedPosts
	}
	if req.DefaultOmniPostsOnly != nil {
		settings.DefaultOmniPostsOnly = *req.DefaultOmniPostsOnly
	}
	if req.StayOnPostAfterHide != nil {
		settings.StayOnPostAfterHide = *req.StayOnPostAfterHide
	}
	if req.UseInfiniteScrollHome != nil {
		settings.UseInfiniteScrollHome = *req.UseInfiniteScrollHome
	}
	if req.UseInfiniteScrollHubs != nil {
		settings.UseInfiniteScrollHubs = *req.UseInfiniteScrollHubs
	}
	if req.UseInfiniteScrollSubs != nil {
		settings.UseInfiniteScrollSubs = *req.UseInfiniteScrollSubs
	}
	if req.UseInfiniteScroll != nil {
		settings.UseInfiniteScroll = *req.UseInfiniteScroll
	}
	if req.SearchIncludeNsfwByDefault != nil {
		settings.SearchIncludeNsfwByDefault = *req.SearchIncludeNsfwByDefault
	}
	if req.BlockAllNsfw != nil {
		settings.BlockAllNsfw = *req.BlockAllNsfw
	}
	if req.BlockNsfwThumbnails != nil {
		settings.BlockNsfwThumbnails = *req.BlockNsfwThumbnails
	}
	if req.AccessRequestCooldownDisplay != nil {
		v := strings.ToLower(strings.TrimSpace(*req.AccessRequestCooldownDisplay))
		switch v {
		case "days", "date", "both":
			settings.AccessRequestCooldownDisplay = v
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid access_request_cooldown_display"})
			return
		}
	}
	if req.FontSize != nil {
		v := strings.ToLower(strings.TrimSpace(*req.FontSize))
		switch v {
		case "small", "medium", "large":
			settings.FontSize = v
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid font_size"})
			return
		}
	}
	if req.TranscriptionOptIn != nil {
		settings.TranscriptionOptIn = *req.TranscriptionOptIn
	}
	if req.MicDeviceID != nil {
		v := strings.TrimSpace(*req.MicDeviceID)
		if len(v) > 255 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid mic_device_id"})
			return
		}
		settings.MicDeviceID = v
	}
	if req.CameraDeviceID != nil {
		v := strings.TrimSpace(*req.CameraDeviceID)
		if len(v) > 255 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid camera_device_id"})
			return
		}
		settings.CameraDeviceID = v
	}
	if req.SpeakerDeviceID != nil {
		v := strings.TrimSpace(*req.SpeakerDeviceID)
		if len(v) > 255 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid speaker_device_id"})
			return
		}
		settings.SpeakerDeviceID = v
	}
	if req.QuietHoursEnabled != nil {
		settings.QuietHoursEnabled = *req.QuietHoursEnabled
	}
	if req.QuietHoursStartMinutes != nil {
		if *req.QuietHoursStartMinutes < 0 || *req.QuietHoursStartMinutes > 1439 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid quiet_hours_start_minutes"})
			return
		}
		settings.QuietHoursStartMinutes = *req.QuietHoursStartMinutes
	}
	if req.QuietHoursEndMinutes != nil {
		if *req.QuietHoursEndMinutes < 0 || *req.QuietHoursEndMinutes > 1439 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid quiet_hours_end_minutes"})
			return
		}
		settings.QuietHoursEndMinutes = *req.QuietHoursEndMinutes
	}
	if req.QuietHoursTimezone != nil {
		v := strings.TrimSpace(*req.QuietHoursTimezone)
		if v == "" || len(v) > 64 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid quiet_hours_timezone"})
			return
		}
		if _, err := time.LoadLocation(v); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid quiet_hours_timezone"})
			return
		}
		settings.QuietHoursTimezone = v
	}
	if settings.QuietHoursEnabled && settings.QuietHoursStartMinutes == settings.QuietHoursEndMinutes {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "quiet_hours_start_minutes and quiet_hours_end_minutes must differ when quiet hours are enabled",
		})
		return
	}
	if req.BatchNotifications != nil {
		settings.BatchNotifications = *req.BatchNotifications
	}

	// Update notification preferences
	if req.NotifyCommentReplies != nil {
		settings.NotifyCommentReplies = *req.NotifyCommentReplies
	}
	if req.NotifyPostMilestone != nil {
		settings.NotifyPostMilestone = *req.NotifyPostMilestone
	}
	if req.NotifyPostVelocity != nil {
		settings.NotifyPostVelocity = *req.NotifyPostVelocity
	}
	if req.NotifyCommentMilestone != nil {
		settings.NotifyCommentMilestone = *req.NotifyCommentMilestone
	}
	if req.NotifyCommentVelocity != nil {
		settings.NotifyCommentVelocity = *req.NotifyCommentVelocity
	}
	if req.DailyDigest != nil {
		settings.DailyDigest = *req.DailyDigest
	}

	updated, err := h.settingsRepo.Update(c.Request.Context(), settings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update settings"})
		return
	}

	c.JSON(http.StatusOK, updated)
}

func (h *SettingsHandler) getUserID(c *gin.Context) (int, bool) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return 0, false
	}

	userID, ok := userIDValue.(int)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user id"})
		return 0, false
	}

	return userID, true
}

func (h *SettingsHandler) getOrCreateSettings(c *gin.Context, userID int) (*models.UserSettings, error) {
	settings, err := h.settingsRepo.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		return nil, err
	}

	if settings == nil {
		settings, err = h.settingsRepo.CreateDefault(c.Request.Context(), userID)
		if err != nil {
			return nil, err
		}
	}

	return settings, nil
}

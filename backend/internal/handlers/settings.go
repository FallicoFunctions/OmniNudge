package handlers

import (
	"net/http"
	"strings"

	"github.com/chatreddit/backend/internal/models"
	"github.com/gin-gonic/gin"
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
	NotificationSound    *bool   `json:"notification_sound"`
	ShowReadReceipts     *bool   `json:"show_read_receipts"`
	ShowTypingIndicators *bool   `json:"show_typing_indicators"`
	AutoAppendInvitation *bool   `json:"auto_append_invitation"`
	Theme                *string `json:"theme"`
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
	if req.AutoAppendInvitation != nil {
		settings.AutoAppendInvitation = *req.AutoAppendInvitation
	}
	if req.Theme != nil {
		theme := strings.ToLower(strings.TrimSpace(*req.Theme))
		if theme == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Theme cannot be empty"})
			return
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

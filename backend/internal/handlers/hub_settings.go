package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/omninudge/backend/internal/helpers"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
)

type HubSettingsHandler struct {
	hubRepo      *models.HubRepository
	settingsRepo *repository.HubSettingsRepository
	userRepo     *models.UserRepository
}

func NewHubSettingsHandler(hubRepo *models.HubRepository, settingsRepo *repository.HubSettingsRepository, userRepo *models.UserRepository) *HubSettingsHandler {
	return &HubSettingsHandler{
		hubRepo:      hubRepo,
		settingsRepo: settingsRepo,
		userRepo:     userRepo,
	}
}

// GetHubSettings handles GET /api/v1/hubs/:name/settings
// Returns hub settings (public can see some, mods see all)
func (h *HubSettingsHandler) GetHubSettings(c *gin.Context) {
	hubName := c.Param("name")

	// Get hub ID from name
	hubID, err := h.getHubIDByName(c, hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	settings, err := h.settingsRepo.GetByHubID(c.Request.Context(), hubID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || h.hubRepo != nil {
			hub, hubErr := h.hubRepo.GetByName(c.Request.Context(), hubName)
			if hubErr != nil || hub == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
				return
			}

			allowText, allowLink, allowImage, allowVideo := mapContentOptions(hub.ContentOptions)
			defaults := buildDefaultHubSettings(hub.ID, hub.Type, allowText, allowLink, allowImage, allowVideo)
			var createdBy *int
			if hub.CreatedBy != nil {
				createdBy = hub.CreatedBy
			}
			if err := h.settingsRepo.EnsureDefaults(c.Request.Context(), defaults, createdBy); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to initialize hub settings", "details": err.Error()})
				return
			}

			settings, err = h.settingsRepo.GetByHubID(c.Request.Context(), hubID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get settings", "details": err.Error()})
				return
			}
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get settings", "details": err.Error()})
			return
		}
	}

	// Check if user is a moderator
	userID, exists := c.Get("user_id")
	isModerator := false
	if exists {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID.(int))
		isModerator = (err == nil && role != nil)
	}

	// If not a moderator, hide sensitive settings
	if !isModerator {
		settings.BannedWords = nil
		settings.NewAccountFilterDays = 0
		settings.MinAccountKarma = 0
	}

	// Fetch hub to get NSFW status
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err == nil && hub != nil {
		settings.NSFW = hub.NSFW
	}

	c.JSON(http.StatusOK, settings)
}

// UpdateHubSettings handles PUT /api/v1/hubs/:name/settings
// Updates hub settings (requires owner or full_moderator role)
func (h *HubSettingsHandler) UpdateHubSettings(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hubID, err := h.getHubIDByName(c, hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	if !helpers.IsAdmin(c) {
		// Check permissions: must be owner or full_moderator
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID.(int))
		if err != nil || role == nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not a moderator"})
			return
		}

		if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
			c.JSON(http.StatusForbidden, gin.H{"error": "Requires owner or full_moderator role"})
			return
		}
	}

	var settings models.HubSettings
	if err := c.ShouldBindJSON(&settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	settings.HubID = hubID
	if len(settings.BannedWords) == 0 {
		settings.BannedWords = nil
	}

	if err := h.settingsRepo.Update(c.Request.Context(), &settings, userID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update settings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Settings updated successfully"})
}

// GetHubModerators handles GET /api/v1/hubs/:name/moderators
// Returns list of all moderators with their roles
func (h *HubSettingsHandler) GetHubModerators(c *gin.Context) {
	hubName := c.Param("name")
	hubID, err := h.getHubIDByName(c, hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	moderators, err := h.settingsRepo.GetHubModerators(c.Request.Context(), hubID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get moderators"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"moderators": moderators})
}

// AddHubModerator handles POST /api/v1/hubs/:name/moderators
// Adds a new moderator (requires owner role)
func (h *HubSettingsHandler) AddHubModerator(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hubID, err := h.getHubIDByName(c, hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	// Check permissions: must be owner
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID.(int))
	if err != nil || role == nil || *role != models.ModeratorRoleOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": "Requires owner role"})
		return
	}

	var req struct {
		Username string               `json:"username" binding:"required"`
		Role     models.ModeratorRole `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// Validate role
	if req.Role != models.ModeratorRoleFullModerator && req.Role != models.ModeratorRoleModerator {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid role. Can only add full_moderator or moderator"})
		return
	}

	// Look up user by username (case-insensitive)
	targetUser, err := h.userRepo.GetByUsername(c.Request.Context(), req.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to look up user"})
		return
	}
	if targetUser == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if err := h.settingsRepo.AddModerator(c.Request.Context(), hubID, targetUser.ID, req.Role); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add moderator"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Moderator added successfully"})
}

// UpdateModeratorRole handles PATCH /api/v1/hubs/:name/moderators/:user_id
// Updates a moderator's role (requires owner role)
func (h *HubSettingsHandler) UpdateModeratorRole(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hubID, err := h.getHubIDByName(c, hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	targetUserID, err := strconv.Atoi(c.Param("user_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Check permissions: must be owner
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID.(int))
	if err != nil || role == nil || *role != models.ModeratorRoleOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": "Requires owner role"})
		return
	}

	var req struct {
		Role models.ModeratorRole `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// Cannot change owner role
	if req.Role == models.ModeratorRoleOwner {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot change owner role"})
		return
	}

	if err := h.settingsRepo.UpdateModeratorRole(c.Request.Context(), hubID, targetUserID, req.Role); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update moderator role"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Moderator role updated successfully"})
}

// RemoveHubModerator handles DELETE /api/v1/hubs/:name/moderators/:user_id
// Removes a moderator (requires owner role, cannot remove owner)
func (h *HubSettingsHandler) RemoveHubModerator(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hubID, err := h.getHubIDByName(c, hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	targetUserID, err := strconv.Atoi(c.Param("user_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Check permissions: must be owner
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID.(int))
	if err != nil || role == nil || *role != models.ModeratorRoleOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": "Requires owner role"})
		return
	}

	// The repository will prevent removing owner role
	if err := h.settingsRepo.RemoveModerator(c.Request.Context(), hubID, targetUserID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove moderator"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Moderator removed successfully"})
}

// Helper function to get hub ID by name
func (h *HubSettingsHandler) getHubIDByName(c *gin.Context, hubName string) (int, error) {
	return h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
}

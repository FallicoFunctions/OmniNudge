package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/utils"
)

type HubThemesHandler struct {
	themesRepo   *repository.HubThemesRepository
	settingsRepo *repository.HubSettingsRepository
	cssSanitizer *utils.CSSSanitizer
}

func NewHubThemesHandler(themesRepo *repository.HubThemesRepository, settingsRepo *repository.HubSettingsRepository) *HubThemesHandler {
	return &HubThemesHandler{
		themesRepo:   themesRepo,
		settingsRepo: settingsRepo,
		cssSanitizer: utils.NewCSSSanitizer(),
	}
}

// GetActiveTheme handles GET /api/v1/hubs/:name/theme
// Returns the active theme for a hub (public access)
func (h *HubThemesHandler) GetActiveTheme(c *gin.Context) {
	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	theme, err := h.themesRepo.GetActiveTheme(c.Request.Context(), hubID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "No active theme"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get theme"})
		return
	}

	c.JSON(http.StatusOK, theme)
}

// GetAllThemes handles GET /api/v1/hubs/:name/themes
// Returns all theme versions for a hub (moderator only)
func (h *HubThemesHandler) GetAllThemes(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	// Check permissions: must be at least a moderator
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID.(int))
	if err != nil || role == nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a moderator"})
		return
	}

	themes, err := h.themesRepo.GetAllThemes(c.Request.Context(), hubID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get themes"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"themes": themes})
}

// CreateTheme handles POST /api/v1/hubs/:name/themes
// Creates a new theme (requires full_moderator or owner)
func (h *HubThemesHandler) CreateTheme(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	// Check permissions: must be full_moderator or owner
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID.(int))
	if err != nil || role == nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a moderator"})
		return
	}

	if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
		c.JSON(http.StatusForbidden, gin.H{"error": "Requires owner or full_moderator role"})
		return
	}

	var theme models.HubTheme
	if err := c.ShouldBindJSON(&theme); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	theme.HubID = hubID
	theme.CreatedBy = userID.(int)
	theme.Version = 1 // New theme starts at version 1

	// Sanitize CSS if provided
	if theme.CSSContent != nil && *theme.CSSContent != "" {
		sanitized, err := h.cssSanitizer.Sanitize(*theme.CSSContent)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid CSS", "details": err.Error()})
			return
		}
		theme.CSSContent = &sanitized
	}

	themeID, err := h.themesRepo.CreateTheme(c.Request.Context(), &theme)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create theme"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Theme created successfully",
		"theme_id": themeID,
	})
}

// UpdateTheme handles PUT /api/v1/hubs/:name/themes/:id
// Updates a theme (creates new version) (requires full_moderator or owner)
func (h *HubThemesHandler) UpdateTheme(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	themeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme ID"})
		return
	}

	// Check permissions: must be full_moderator or owner
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID.(int))
	if err != nil || role == nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a moderator"})
		return
	}

	if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
		c.JSON(http.StatusForbidden, gin.H{"error": "Requires owner or full_moderator role"})
		return
	}

	var theme models.HubTheme
	if err := c.ShouldBindJSON(&theme); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	theme.ID = themeID
	theme.HubID = hubID

	// Sanitize CSS if provided
	if theme.CSSContent != nil && *theme.CSSContent != "" {
		sanitized, err := h.cssSanitizer.Sanitize(*theme.CSSContent)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid CSS", "details": err.Error()})
			return
		}
		theme.CSSContent = &sanitized
	}

	newThemeID, err := h.themesRepo.UpdateTheme(c.Request.Context(), &theme, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update theme"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Theme updated successfully (new version created)",
		"new_theme_id": newThemeID,
	})
}

// ActivateTheme handles POST /api/v1/hubs/:name/themes/:id/activate
// Activates a specific theme version (requires full_moderator or owner)
func (h *HubThemesHandler) ActivateTheme(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	themeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme ID"})
		return
	}

	// Check permissions: must be full_moderator or owner
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID.(int))
	if err != nil || role == nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a moderator"})
		return
	}

	if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
		c.JSON(http.StatusForbidden, gin.H{"error": "Requires owner or full_moderator role"})
		return
	}

	if err := h.themesRepo.ActivateTheme(c.Request.Context(), themeID, hubID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to activate theme"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Theme activated successfully"})
}

// DeleteTheme handles DELETE /api/v1/hubs/:name/themes/:id
// Deletes a theme (cannot delete active theme) (requires owner)
func (h *HubThemesHandler) DeleteTheme(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	themeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme ID"})
		return
	}

	// Check permissions: must be owner
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID.(int))
	if err != nil || role == nil || *role != models.ModeratorRoleOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": "Requires owner role"})
		return
	}

	if err := h.themesRepo.DeleteTheme(c.Request.Context(), themeID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Theme deleted successfully"})
}

// PreviewTheme handles POST /api/v1/hubs/:name/themes/preview
// Returns sanitized and scoped CSS for preview (requires moderator)
func (h *HubThemesHandler) PreviewTheme(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	// Check permissions: must be at least a moderator
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID.(int))
	if err != nil || role == nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a moderator"})
		return
	}

	var req struct {
		CSSContent        string `json:"css_content" binding:"required"`
		ApplyToWholePage  bool   `json:"apply_to_whole_page"`
		ApplyToHeader     bool   `json:"apply_to_header"`
		ApplyToSidebar    bool   `json:"apply_to_sidebar"`
		ApplyToPostList   bool   `json:"apply_to_post_list"`
		ApplyToPostDetail bool   `json:"apply_to_post_detail"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// Sanitize CSS
	sanitized, err := h.cssSanitizer.Sanitize(req.CSSContent)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid CSS", "details": err.Error()})
		return
	}

	// Generate scoped CSS based on application settings
	var scopedCSS string
	if req.ApplyToWholePage {
		scopedCSS, _ = h.cssSanitizer.GenerateScopedCSS(sanitized, ".hub-"+hubName)
	} else {
		// Apply to specific sections
		var sections []string
		if req.ApplyToHeader {
			sections = append(sections, ".hub-header-"+hubName)
		}
		if req.ApplyToSidebar {
			sections = append(sections, ".hub-sidebar-"+hubName)
		}
		if req.ApplyToPostList {
			sections = append(sections, ".hub-post-list-"+hubName)
		}
		if req.ApplyToPostDetail {
			sections = append(sections, ".hub-post-detail-"+hubName)
		}

		// Generate scoped CSS for each section
		for _, section := range sections {
			sectionCSS, _ := h.cssSanitizer.GenerateScopedCSS(sanitized, section)
			scopedCSS += sectionCSS + "\n"
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"sanitized_css": sanitized,
		"scoped_css":    scopedCSS,
	})
}

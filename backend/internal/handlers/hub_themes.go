package handlers

import (
	"github.com/omninudge/backend/internal/api/middleware"
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

// GetActiveTheme handles GET /api/v1/hubs/:name/theme.
// Returns the active theme for a hub (public access)
// @Summary      Get active hub theme
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Success      200   {object}  gin.H
// @Failure      404   {object}  gin.H
// @Router       /hubs/{name}/theme [get]
func (h *HubThemesHandler) GetActiveTheme(c *gin.Context) {
	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	theme, err := h.themesRepo.GetActiveTheme(c.Request.Context(), hubID)
	if err != nil {
		if err == pgx.ErrNoRows {
			RespondError(c, http.StatusNotFound, "No active theme")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to get theme")
		return
	}

	c.JSON(http.StatusOK, theme)
}

// GetAllThemes handles GET /api/v1/hubs/:name/themes.
// Returns all theme versions for a hub (moderator only)
// @Summary      Get all hub themes
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Success      200   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/themes [get]
func (h *HubThemesHandler) GetAllThemes(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	// Check permissions: must be at least a moderator
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
	if err != nil || role == nil {
		RespondError(c, http.StatusForbidden, "Not a moderator")
		return
	}

	themes, err := h.themesRepo.GetAllThemes(c.Request.Context(), hubID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get themes")
		return
	}

	c.JSON(http.StatusOK, gin.H{"themes": themes})
}

// CreateTheme handles POST /api/v1/hubs/:name/themes.
// Creates a new theme (requires full_moderator or owner)
// @Summary      Create hub theme
// @Tags         Hubs
// @Accept       json
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Param        body  body      object  true  "Theme payload"
// @Success      201   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/themes [post]
func (h *HubThemesHandler) CreateTheme(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	// Check permissions: must be full_moderator or owner
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
	if err != nil || role == nil {
		RespondError(c, http.StatusForbidden, "Not a moderator")
		return
	}

	if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
		RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
		return
	}

	var theme models.HubTheme
	if err := c.ShouldBindJSON(&theme); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	theme.HubID = hubID
	theme.CreatedBy = userID
	theme.Version = 1 // New theme starts at version 1

	// Sanitize CSS if provided
	if theme.CSSContent != nil && *theme.CSSContent != "" {
		sanitized, err := h.cssSanitizer.Sanitize(*theme.CSSContent)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid CSS")
			return
		}
		theme.CSSContent = &sanitized
	}

	themeID, err := h.themesRepo.CreateTheme(c.Request.Context(), &theme)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create theme")
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Theme created successfully",
		"theme_id": themeID,
	})
}

// UpdateTheme handles PUT /api/v1/hubs/:name/themes/:id.
// Updates a theme (creates new version) (requires full_moderator or owner)
// @Summary      Update hub theme
// @Tags         Hubs
// @Accept       json
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Param        id    path      int     true  "Theme ID"
// @Param        body  body      object  true  "Theme payload"
// @Success      200   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/themes/{id} [put]
func (h *HubThemesHandler) UpdateTheme(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	themeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid theme ID")
		return
	}

	// Check permissions: must be full_moderator or owner
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
	if err != nil || role == nil {
		RespondError(c, http.StatusForbidden, "Not a moderator")
		return
	}

	if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
		RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
		return
	}

	var theme models.HubTheme
	if err := c.ShouldBindJSON(&theme); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	theme.ID = themeID
	theme.HubID = hubID

	// Sanitize CSS if provided
	if theme.CSSContent != nil && *theme.CSSContent != "" {
		sanitized, err := h.cssSanitizer.Sanitize(*theme.CSSContent)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid CSS")
			return
		}
		theme.CSSContent = &sanitized
	}

	newThemeID, err := h.themesRepo.UpdateTheme(c.Request.Context(), &theme, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update theme")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Theme updated successfully (new version created)",
		"new_theme_id": newThemeID,
	})
}

// ActivateTheme handles POST /api/v1/hubs/:name/themes/:id/activate.
// Activates a specific theme version (requires full_moderator or owner)
// @Summary      Activate hub theme
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Param        id    path      int     true  "Theme ID"
// @Success      200   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/themes/{id}/activate [post]
func (h *HubThemesHandler) ActivateTheme(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	themeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid theme ID")
		return
	}

	// Check permissions: must be full_moderator or owner
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
	if err != nil || role == nil {
		RespondError(c, http.StatusForbidden, "Not a moderator")
		return
	}

	if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
		RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
		return
	}

	if err := h.themesRepo.ActivateTheme(c.Request.Context(), themeID, hubID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to activate theme")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Theme activated successfully"})
}

// DeleteTheme handles DELETE /api/v1/hubs/:name/themes/:id.
// Deletes a theme (cannot delete active theme) (requires owner)
// @Summary      Delete hub theme
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Param        id    path      int     true  "Theme ID"
// @Success      200   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/themes/{id} [delete]
func (h *HubThemesHandler) DeleteTheme(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	themeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid theme ID")
		return
	}

	// Check permissions: must be owner
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
	if err != nil || role == nil || *role != models.ModeratorRoleOwner {
		RespondError(c, http.StatusForbidden, "Requires owner role")
		return
	}

	if err := h.themesRepo.DeleteTheme(c.Request.Context(), themeID); err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Theme deleted successfully"})
}

// PreviewTheme handles POST /api/v1/hubs/:name/themes/preview.
// Returns sanitized and scoped CSS for preview (requires moderator)
// @Summary      Preview hub theme CSS
// @Tags         Hubs
// @Accept       json
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Param        body  body      object  true  "Theme CSS payload"
// @Success      200   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/themes/preview [post]
func (h *HubThemesHandler) PreviewTheme(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	// Check permissions: must be at least a moderator
	role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
	if err != nil || role == nil {
		RespondError(c, http.StatusForbidden, "Not a moderator")
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
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Sanitize CSS
	sanitized, err := h.cssSanitizer.Sanitize(req.CSSContent)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid CSS")
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

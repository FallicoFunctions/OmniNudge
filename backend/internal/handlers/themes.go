package handlers

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/omninudge/backend/internal/ports"

	"github.com/gin-gonic/gin"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// ThemesHandler handles user theme customization endpoints.
type ThemesHandler struct {
	themeRepo         ports.UserThemeRepository
	themeOverrideRepo ports.UserThemeOverrideRepository
	installedRepo     ports.UserInstalledThemeRepository
	settingsRepo      ports.UserSettingsRepository
	sanitizer         *services.CSSSanitizer
}

// NewThemesHandler creates a new themes handler.
func NewThemesHandler(
	themeRepo ports.UserThemeRepository,
	themeOverrideRepo ports.UserThemeOverrideRepository,
	installedRepo ports.UserInstalledThemeRepository,
	settingsRepo ports.UserSettingsRepository,
	sanitizer *services.CSSSanitizer,
) *ThemesHandler {
	return &ThemesHandler{
		themeRepo:         themeRepo,
		themeOverrideRepo: themeOverrideRepo,
		installedRepo:     installedRepo,
		settingsRepo:      settingsRepo,
		sanitizer:         sanitizer,
	}
}

// ============================================================================
// Validation Helpers
// ============================================================================

// validThemeTypes are the allowed theme types
var validThemeTypes = map[string]bool{
	"predefined":             true,
	"variable_customization": true,
	"full_css":               true,
}

// validScopeTypes are the allowed scope types
var validScopeTypes = map[string]bool{
	"global":   true,
	"per_page": true,
}

// validPageNames are the allowed page names for overrides
var validPageNames = map[string]bool{
	"feed":          true,
	"profile":       true,
	"settings":      true,
	"messages":      true,
	"notifications": true,
	"search":        true,
}

// validateThemeName validates a theme name
func (h *ThemesHandler) validateThemeName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return gin.Error{Err: nil, Type: gin.ErrorTypeBind, Meta: "Theme name cannot be empty"}
	}
	if len(name) > 100 {
		return gin.Error{Err: nil, Type: gin.ErrorTypeBind, Meta: "Theme name must be 100 characters or less"}
	}
	return nil
}

// validateCSSVariables validates CSS variable map
func (h *ThemesHandler) validateCSSVariables(vars map[string]interface{}) error {
	if vars == nil {
		return nil
	}
	// Basic validation - check for reasonable size
	if len(vars) > 200 {
		return gin.Error{Err: nil, Type: gin.ErrorTypeBind, Meta: "Too many CSS variables (max 200)"}
	}
	// Validate each key/value pair
	for key, value := range vars {
		// Keys should be valid CSS variable names (lowercase, hyphens)
		if !isValidCSSVariableName(key) {
			return gin.Error{Err: nil, Type: gin.ErrorTypeBind, Meta: "Invalid CSS variable name: " + key}
		}
		// Values should be strings
		if _, ok := value.(string); !ok {
			return gin.Error{Err: nil, Type: gin.ErrorTypeBind, Meta: "CSS variable values must be strings"}
		}
	}
	return nil
}

// isValidCSSVariableName checks if a CSS variable name is valid
func isValidCSSVariableName(name string) bool {
	if len(name) == 0 || len(name) > 100 {
		return false
	}
	// CSS variable names should only contain lowercase letters, numbers, and hyphens
	for _, char := range name {
		if !((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '-') {
			return false
		}
	}
	return true
}

// ============================================================================
// Theme CRUD Operations
// ============================================================================

type createThemeRequest struct {
	ThemeName        string                 `json:"theme_name" binding:"required"`
	ThemeDescription *string                `json:"theme_description"`
	ThemeType        string                 `json:"theme_type" binding:"required"` // 'predefined', 'variable_customization', 'full_css'
	ScopeType        string                 `json:"scope_type" binding:"required"` // 'global', 'per_page'
	TargetPage       *string                `json:"target_page"`
	CSSVariables     map[string]interface{} `json:"css_variables"`
	CustomCSS        *string                `json:"custom_css"`
	IsPublic         bool                   `json:"is_public"`
	Category         *string                `json:"category"`
	Tags             []string               `json:"tags"`
	ThumbnailURL     *string                `json:"thumbnail_url"`
}

// CreateTheme creates a new user-defined theme.
// @Summary      Create theme
// @Tags         Themes
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      201  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /themes [post]
func (h *ThemesHandler) CreateTheme(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req createThemeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	// Validate theme name
	if err := h.validateThemeName(req.ThemeName); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	// Validate theme type
	if !validThemeTypes[req.ThemeType] {
		RespondError(c, http.StatusBadRequest, "Invalid theme_type. Must be: predefined, variable_customization, or full_css")
		return
	}

	// Validate scope type
	if !validScopeTypes[req.ScopeType] {
		RespondError(c, http.StatusBadRequest, "Invalid scope_type. Must be: global or per_page")
		return
	}

	// If per_page, target_page is required
	if req.ScopeType == "per_page" && (req.TargetPage == nil || *req.TargetPage == "") {
		RespondError(c, http.StatusBadRequest, "target_page is required when scope_type is per_page")
		return
	}

	// Validate target page if provided
	if req.TargetPage != nil {
		if !validPageNames[*req.TargetPage] {
			RespondError(c, http.StatusBadRequest, "Invalid target_page. Must be: feed, profile, settings, messages, notifications, or search")
			return
		}
	}

	// Validate CSS variables
	if err := h.validateCSSVariables(req.CSSVariables); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	// Sanitize custom CSS if provided
	if req.CustomCSS != nil && *req.CustomCSS != "" {
		if err := h.sanitizer.Sanitize(*req.CustomCSS); err != nil {
			log.Printf("CSS sanitization failed for user %d: %v", userID, err)
			RespondError(c, http.StatusBadRequest, "CSS validation failed")
			return
		}
	}

	// Create theme
	theme := &models.UserTheme{
		UserID:           userID,
		ThemeName:        req.ThemeName,
		ThemeDescription: req.ThemeDescription,
		ThemeType:        req.ThemeType,
		ScopeType:        req.ScopeType,
		TargetPage:       req.TargetPage,
		CSSVariables:     req.CSSVariables,
		CustomCSS:        req.CustomCSS,
		IsPublic:         req.IsPublic,
		IsMarketplace:    false, // Only admin can set this
		PriceCoins:       0,     // Only admin can set this
		Category:         req.Category,
		Tags:             req.Tags,
		ThumbnailURL:     req.ThumbnailURL,
		Version:          "1.0.0",
	}

	created, err := h.themeRepo.Create(c.Request.Context(), theme)
	if err != nil {
		log.Printf("Failed to create theme for user %d: %v", userID, err)
		RespondError(c, http.StatusInternalServerError, "Failed to create theme")
		return
	}

	log.Printf("User %d created theme: %s (ID: %d)", userID, created.ThemeName, created.ID)
	c.JSON(http.StatusCreated, created)
}

// GetTheme returns a theme by ID.
// @Summary      Get theme
// @Tags         Themes
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Theme ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /themes/{id} [get]
func (h *ThemesHandler) GetTheme(c *gin.Context) {
	themeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid theme ID")
		return
	}

	theme, err := h.themeRepo.GetByID(c.Request.Context(), themeID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch theme")
		return
	}

	if theme == nil {
		RespondError(c, http.StatusNotFound, "Theme not found")
		return
	}

	c.JSON(http.StatusOK, theme)
}

// GetMyThemes returns themes created by the current user.
// @Summary      Get my themes
// @Tags         Themes
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}   gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /themes/my [get]
func (h *ThemesHandler) GetMyThemes(c *gin.Context) {
	userID := c.GetInt("user_id")

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursorParam := c.Query("cursor")
	if limit < 1 || limit > 100 {
		limit = 20
	}

	var cursor *timeCursor
	if cursorParam != "" {
		decoded, err := decodeTimeCursor(cursorParam)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
			return
		}
		cursor = decoded
	}
	useCursorPagination := cursorParam != "" || offset == 0
	limitArg := limit
	if useCursorPagination {
		limitArg = limit + 1
		offset = 0
	}

	var themes []*models.UserTheme
	var err error
	if useCursorPagination {
		var payload *models.TimeCursor
		if cursor != nil {
			payload = &models.TimeCursor{ID: cursor.ID, Timestamp: cursor.Timestamp}
		}
		themes, err = h.themeRepo.GetByUserIDWithCursor(c.Request.Context(), userID, limitArg, payload)
	} else {
		themes, err = h.themeRepo.GetByUserID(c.Request.Context(), userID, limitArg, offset)
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch themes")
		return
	}

	// Ensure themes is never nil (convert nil to empty slice for JSON)
	if themes == nil {
		themes = make([]*models.UserTheme, 0)
	}

	nextCursor := ""
	if useCursorPagination && len(themes) > limit {
		themes = themes[:limit]
		if len(themes) > 0 {
			last := themes[len(themes)-1]
			nextCursor = encodeTimeCursor(timeCursor{ID: last.ID, Timestamp: last.CreatedAt})
		}
	}

	response := gin.H{
		"themes": themes,
		"limit":  limit,
		"offset": offset,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
}

type updateThemeRequest struct {
	ThemeName        *string                `json:"theme_name"`
	ThemeDescription *string                `json:"theme_description"`
	CSSVariables     map[string]interface{} `json:"css_variables"`
	CustomCSS        *string                `json:"custom_css"`
	IsPublic         *bool                  `json:"is_public"`
	Category         *string                `json:"category"`
	Tags             []string               `json:"tags"`
	ThumbnailURL     *string                `json:"thumbnail_url"`
}

// UpdateTheme updates an existing theme.
// @Summary      Update theme
// @Tags         Themes
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Theme ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /themes/{id} [put]
func (h *ThemesHandler) UpdateTheme(c *gin.Context) {
	userID := c.GetInt("user_id")
	themeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid theme ID")
		return
	}

	// Get existing theme
	theme, err := h.themeRepo.GetByID(c.Request.Context(), themeID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch theme")
		return
	}
	if theme == nil {
		RespondError(c, http.StatusNotFound, "Theme not found")
		return
	}

	// Verify ownership
	if theme.UserID != userID {
		RespondError(c, http.StatusForbidden, "You can only update your own themes")
		return
	}

	var req updateThemeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	// Update fields
	if req.ThemeName != nil {
		if len(*req.ThemeName) > 100 {
			RespondError(c, http.StatusBadRequest, "Theme name must be 100 characters or less")
			return
		}
		theme.ThemeName = *req.ThemeName
	}
	if req.ThemeDescription != nil {
		theme.ThemeDescription = req.ThemeDescription
	}
	if req.CSSVariables != nil {
		theme.CSSVariables = req.CSSVariables
	}
	if req.CustomCSS != nil {
		if *req.CustomCSS != "" {
			if err := h.sanitizer.Sanitize(*req.CustomCSS); err != nil {
				RespondError(c, http.StatusBadRequest, "CSS validation failed")
				return
			}
			theme.CustomCSS = req.CustomCSS
		} else {
			theme.CustomCSS = nil
		}
	}
	if req.IsPublic != nil {
		theme.IsPublic = *req.IsPublic
	}
	if req.Category != nil {
		theme.Category = req.Category
	}
	if req.Tags != nil {
		theme.Tags = req.Tags
	}
	if req.ThumbnailURL != nil {
		theme.ThumbnailURL = req.ThumbnailURL
	}

	if err := h.themeRepo.Update(c.Request.Context(), theme); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update theme")
		return
	}

	// Re-fetch the updated theme to return
	updated, err := h.themeRepo.GetByID(c.Request.Context(), themeID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch updated theme")
		return
	}

	c.JSON(http.StatusOK, updated)
}

// DeleteTheme deletes a theme.
// @Summary      Delete theme
// @Tags         Themes
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Theme ID"
// @Success      204
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /themes/{id} [delete]
func (h *ThemesHandler) DeleteTheme(c *gin.Context) {
	userID := c.GetInt("user_id")
	themeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid theme ID")
		return
	}

	// Get existing theme
	theme, err := h.themeRepo.GetByID(c.Request.Context(), themeID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch theme")
		return
	}
	if theme == nil {
		RespondError(c, http.StatusNotFound, "Theme not found")
		return
	}

	// Verify ownership
	if theme.UserID != userID {
		RespondError(c, http.StatusForbidden, "You can only delete your own themes")
		return
	}

	if err := h.themeRepo.Delete(c.Request.Context(), themeID, userID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete theme")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Theme deleted successfully"})
}

// ============================================================================
// Predefined Themes
// ============================================================================

// GetPredefinedThemes returns the built-in theme presets.
// @Summary      Get predefined themes
// @Tags         Themes
// @Produce      json
// @Success      200  {array}   gin.H
// @Router       /themes/predefined [get]
func (h *ThemesHandler) GetPredefinedThemes(c *gin.Context) {
	themes, err := h.themeRepo.GetPredefinedThemes(c.Request.Context())
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch predefined themes")
		return
	}

	// Ensure themes is never nil (convert nil to empty slice for JSON)
	if themes == nil {
		themes = make([]*models.UserTheme, 0)
	}

	c.JSON(http.StatusOK, gin.H{
		"themes": themes,
		"count":  len(themes),
	})
}

// ============================================================================
// Public Theme Browser (Phase 2c - Community Sharing)
// ============================================================================

// BrowseThemes returns community-published themes.
// @Summary      Browse themes
// @Tags         Themes
// @Security     BearerAuth
// @Produce      json
// @Param        q       query  string  false  "Search query"
// @Param        limit   query  int     false  "Max results"
// @Param        offset  query  int     false  "Pagination offset"
// @Success      200  {array}   gin.H
// @Failure      500  {object}  gin.H
// @Router       /themes/browse [get]
func (h *ThemesHandler) BrowseThemes(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursorParam := c.Query("cursor")
	if limit < 1 || limit > 100 {
		limit = 20
	}

	category := c.Query("category")
	var categoryPtr *string
	if category != "" {
		categoryPtr = &category
	}

	var cursor *models.ThemePublicCursor
	if cursorParam != "" {
		decoded, err := decodeThemePublicCursor(cursorParam)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
			return
		}
		cursor = decoded
	}
	useCursorPagination := cursorParam != "" || offset == 0
	limitArg := limit
	if useCursorPagination {
		limitArg = limit + 1
		offset = 0
	}

	var themes []*models.UserTheme
	var err error
	if useCursorPagination {
		themes, err = h.themeRepo.GetPublicThemesWithCursor(c.Request.Context(), limitArg, categoryPtr, cursor)
	} else {
		themes, err = h.themeRepo.GetPublicThemes(c.Request.Context(), limitArg, offset, categoryPtr)
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch public themes")
		return
	}

	nextCursor := ""
	if useCursorPagination && len(themes) > limit {
		themes = themes[:limit]
		if len(themes) > 0 {
			last := themes[len(themes)-1]
			nextCursor = encodeThemePublicCursor(models.ThemePublicCursor{
				ID:            last.ID,
				InstallCount:  last.InstallCount,
				AverageRating: last.AverageRating,
				CreatedAt:     last.CreatedAt,
			})
		}
	}

	response := gin.H{
		"themes": themes,
		"limit":  limit,
		"offset": offset,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
}

// ============================================================================
// Theme Installation & Activation
// ============================================================================

type installThemeRequest struct {
	ThemeID int `json:"theme_id" binding:"required"`
}

// InstallTheme handles POST /api/v1/themes/install
func (h *ThemesHandler) InstallTheme(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req installThemeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	// Check if theme exists
	theme, err := h.themeRepo.GetByID(c.Request.Context(), req.ThemeID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch theme")
		return
	}
	if theme == nil {
		RespondError(c, http.StatusNotFound, "Theme not found")
		return
	}

	// Install theme (price_paid = 0 for free themes)
	_, err = h.installedRepo.Install(c.Request.Context(), userID, req.ThemeID, 0)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			RespondError(c, http.StatusConflict, "Theme already installed")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to install theme")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Theme installed successfully"})
}

// UninstallTheme handles DELETE /api/v1/themes/install/:themeId
func (h *ThemesHandler) UninstallTheme(c *gin.Context) {
	userID := c.GetInt("user_id")
	themeID, err := strconv.Atoi(c.Param("themeId"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid theme ID")
		return
	}

	if err := h.installedRepo.Uninstall(c.Request.Context(), userID, themeID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to uninstall theme")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Theme uninstalled successfully"})
}

type setActiveThemeRequest struct {
	ThemeID int `json:"theme_id" binding:"required"`
}

// SetActiveTheme handles POST /api/v1/themes/active
func (h *ThemesHandler) SetActiveTheme(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req setActiveThemeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	// Set as active theme
	if err := h.installedRepo.SetActive(c.Request.Context(), userID, req.ThemeID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to set active theme")
		return
	}

	// Update user_settings.active_theme_id
	settings, err := h.settingsRepo.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch settings")
		return
	}

	if settings == nil {
		// Create default settings
		settings, err = h.settingsRepo.CreateDefault(c.Request.Context(), userID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to create settings")
			return
		}
	}

	settings.ActiveThemeID = &req.ThemeID
	if _, err := h.settingsRepo.Update(c.Request.Context(), settings); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update settings")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Active theme set successfully"})
}

// GetInstalledThemes handles GET /api/v1/themes/installed
func (h *ThemesHandler) GetInstalledThemes(c *gin.Context) {
	userID := c.GetInt("user_id")

	themes, err := h.installedRepo.GetUserInstalledThemes(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch installed themes")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"themes": themes,
		"count":  len(themes),
	})
}

// ============================================================================
// Per-Page Theme Overrides (Level 4)
// ============================================================================

type setPageOverrideRequest struct {
	PageName string `json:"page_name" binding:"required"`
	ThemeID  int    `json:"theme_id" binding:"required"`
}

// SetPageOverride handles POST /api/v1/themes/overrides
func (h *ThemesHandler) SetPageOverride(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req setPageOverrideRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	// Validate page name
	validPages := map[string]bool{
		"feed":          true,
		"profile":       true,
		"settings":      true,
		"messages":      true,
		"notifications": true,
		"search":        true,
	}
	if !validPages[req.PageName] {
		RespondError(c, http.StatusBadRequest, "Invalid page_name")
		return
	}

	// Check if theme exists
	theme, err := h.themeRepo.GetByID(c.Request.Context(), req.ThemeID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch theme")
		return
	}
	if theme == nil {
		RespondError(c, http.StatusNotFound, "Theme not found")
		return
	}

	override, err := h.themeOverrideRepo.SetOverride(c.Request.Context(), userID, req.PageName, req.ThemeID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to set page override")
		return
	}

	c.JSON(http.StatusOK, override)
}

// GetPageOverride handles GET /api/v1/themes/overrides/:pageName
func (h *ThemesHandler) GetPageOverride(c *gin.Context) {
	userID := c.GetInt("user_id")
	pageName := c.Param("pageName")

	override, err := h.themeOverrideRepo.GetOverride(c.Request.Context(), userID, pageName)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch page override")
		return
	}

	if override == nil {
		RespondError(c, http.StatusNotFound, "No override found for this page")
		return
	}

	c.JSON(http.StatusOK, override)
}

// GetAllOverrides handles GET /api/v1/themes/overrides
func (h *ThemesHandler) GetAllOverrides(c *gin.Context) {
	userID := c.GetInt("user_id")

	overrides, err := h.themeOverrideRepo.GetAllOverrides(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch overrides")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"overrides": overrides,
		"count":     len(overrides),
	})
}

// DeletePageOverride handles DELETE /api/v1/themes/overrides/:pageName
func (h *ThemesHandler) DeletePageOverride(c *gin.Context) {
	userID := c.GetInt("user_id")
	pageName := c.Param("pageName")

	if err := h.themeOverrideRepo.DeleteOverride(c.Request.Context(), userID, pageName); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete page override")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Page override deleted successfully"})
}

// ============================================================================
// Advanced Mode Toggle
// ============================================================================

type setAdvancedModeRequest struct {
	AdvancedModeEnabled bool `json:"advanced_mode_enabled"`
}

// SetAdvancedMode handles POST /api/v1/themes/advanced-mode
func (h *ThemesHandler) SetAdvancedMode(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req setAdvancedModeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	settings, err := h.settingsRepo.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch settings")
		return
	}

	if settings == nil {
		settings, err = h.settingsRepo.CreateDefault(c.Request.Context(), userID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to create settings")
			return
		}
	}

	settings.AdvancedModeEnabled = req.AdvancedModeEnabled
	updated, err := h.settingsRepo.Update(c.Request.Context(), settings)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update settings")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":               "Advanced mode updated successfully",
		"advanced_mode_enabled": updated.AdvancedModeEnabled,
	})
}

// ============================================================================
// Theme Rating & Reviews (Phase 2c - Community Features)
// ============================================================================

type rateThemeRequest struct {
	ThemeID int    `json:"theme_id" binding:"required"`
	Rating  int    `json:"rating" binding:"required,min=1,max=5"`
	Review  string `json:"review"`
}

// RateTheme handles POST /api/v1/themes/rate
func (h *ThemesHandler) RateTheme(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req rateThemeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request. Rating must be 1-5")
		return
	}

	var reviewPtr *string
	if req.Review != "" {
		reviewPtr = &req.Review
	}

	if err := h.installedRepo.RateTheme(c.Request.Context(), userID, req.ThemeID, req.Rating, reviewPtr); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to rate theme")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Theme rated successfully"})
}

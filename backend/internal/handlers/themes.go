package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// ThemesHandler handles user theme customization endpoints.
type ThemesHandler struct {
	themeRepo         *models.UserThemeRepository
	themeOverrideRepo *models.UserThemeOverrideRepository
	installedRepo     *models.UserInstalledThemeRepository
	settingsRepo      *models.UserSettingsRepository
	sanitizer         *services.CSSSanitizer
}

// NewThemesHandler creates a new themes handler.
func NewThemesHandler(
	themeRepo *models.UserThemeRepository,
	themeOverrideRepo *models.UserThemeOverrideRepository,
	installedRepo *models.UserInstalledThemeRepository,
	settingsRepo *models.UserSettingsRepository,
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

// CreateTheme handles POST /api/v1/themes
func (h *ThemesHandler) CreateTheme(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req createThemeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	// Validate theme type
	validThemeTypes := map[string]bool{
		"predefined":              true,
		"variable_customization":  true,
		"full_css":                true,
	}
	if !validThemeTypes[req.ThemeType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme_type. Must be: predefined, variable_customization, or full_css"})
		return
	}

	// Validate scope type
	validScopeTypes := map[string]bool{
		"global":   true,
		"per_page": true,
	}
	if !validScopeTypes[req.ScopeType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scope_type. Must be: global or per_page"})
		return
	}

	// If per_page, target_page is required
	if req.ScopeType == "per_page" && (req.TargetPage == nil || *req.TargetPage == "") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "target_page is required when scope_type is per_page"})
		return
	}

	// Validate target page if provided
	if req.TargetPage != nil {
		validPages := map[string]bool{
			"feed":          true,
			"profile":       true,
			"settings":      true,
			"messages":      true,
			"notifications": true,
			"search":        true,
		}
		if !validPages[*req.TargetPage] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target_page"})
			return
		}
	}

	// Sanitize custom CSS if provided
	if req.CustomCSS != nil && *req.CustomCSS != "" {
		if err := h.sanitizer.Sanitize(*req.CustomCSS); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "CSS validation failed", "details": err.Error()})
			return
		}
	}

	// Validate theme name length
	if len(req.ThemeName) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Theme name must be 100 characters or less"})
		return
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create theme", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, created)
}

// GetTheme handles GET /api/v1/themes/:id
func (h *ThemesHandler) GetTheme(c *gin.Context) {
	themeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme ID"})
		return
	}

	theme, err := h.themeRepo.GetByID(c.Request.Context(), themeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch theme", "details": err.Error()})
		return
	}

	if theme == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Theme not found"})
		return
	}

	c.JSON(http.StatusOK, theme)
}

// GetMyThemes handles GET /api/v1/themes/my
func (h *ThemesHandler) GetMyThemes(c *gin.Context) {
	userID := c.GetInt("user_id")

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 20
	}

	themes, err := h.themeRepo.GetByUserID(c.Request.Context(), userID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch themes", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"themes": themes,
		"limit":  limit,
		"offset": offset,
	})
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

// UpdateTheme handles PUT /api/v1/themes/:id
func (h *ThemesHandler) UpdateTheme(c *gin.Context) {
	userID := c.GetInt("user_id")
	themeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme ID"})
		return
	}

	// Get existing theme
	theme, err := h.themeRepo.GetByID(c.Request.Context(), themeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch theme"})
		return
	}
	if theme == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Theme not found"})
		return
	}

	// Verify ownership
	if theme.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only update your own themes"})
		return
	}

	var req updateThemeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Update fields
	if req.ThemeName != nil {
		if len(*req.ThemeName) > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Theme name must be 100 characters or less"})
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
				c.JSON(http.StatusBadRequest, gin.H{"error": "CSS validation failed", "details": err.Error()})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update theme"})
		return
	}

	// Re-fetch the updated theme to return
	updated, err := h.themeRepo.GetByID(c.Request.Context(), themeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch updated theme"})
		return
	}

	c.JSON(http.StatusOK, updated)
}

// DeleteTheme handles DELETE /api/v1/themes/:id
func (h *ThemesHandler) DeleteTheme(c *gin.Context) {
	userID := c.GetInt("user_id")
	themeID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme ID"})
		return
	}

	// Get existing theme
	theme, err := h.themeRepo.GetByID(c.Request.Context(), themeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch theme"})
		return
	}
	if theme == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Theme not found"})
		return
	}

	// Verify ownership
	if theme.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only delete your own themes"})
		return
	}

	if err := h.themeRepo.Delete(c.Request.Context(), themeID, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete theme"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Theme deleted successfully"})
}

// ============================================================================
// Predefined Themes
// ============================================================================

// GetPredefinedThemes handles GET /api/v1/themes/predefined
func (h *ThemesHandler) GetPredefinedThemes(c *gin.Context) {
	themes, err := h.themeRepo.GetPredefinedThemes(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch predefined themes", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"themes": themes,
		"count":  len(themes),
	})
}

// ============================================================================
// Public Theme Browser (Phase 2c - Community Sharing)
// ============================================================================

// BrowseThemes handles GET /api/v1/themes/browse
func (h *ThemesHandler) BrowseThemes(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 20
	}

	category := c.Query("category")
	var categoryPtr *string
	if category != "" {
		categoryPtr = &category
	}

	themes, err := h.themeRepo.GetPublicThemes(c.Request.Context(), limit, offset, categoryPtr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch public themes", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"themes": themes,
		"limit":  limit,
		"offset": offset,
	})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Check if theme exists
	theme, err := h.themeRepo.GetByID(c.Request.Context(), req.ThemeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch theme"})
		return
	}
	if theme == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Theme not found"})
		return
	}

	// Install theme (price_paid = 0 for free themes)
	_, err = h.installedRepo.Install(c.Request.Context(), userID, req.ThemeID, 0)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			c.JSON(http.StatusConflict, gin.H{"error": "Theme already installed"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to install theme"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Theme installed successfully"})
}

// UninstallTheme handles DELETE /api/v1/themes/install/:themeId
func (h *ThemesHandler) UninstallTheme(c *gin.Context) {
	userID := c.GetInt("user_id")
	themeID, err := strconv.Atoi(c.Param("themeId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme ID"})
		return
	}

	if err := h.installedRepo.Uninstall(c.Request.Context(), userID, themeID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to uninstall theme"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Set as active theme
	if err := h.installedRepo.SetActive(c.Request.Context(), userID, req.ThemeID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set active theme"})
		return
	}

	// Update user_settings.active_theme_id
	settings, err := h.settingsRepo.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch settings"})
		return
	}

	if settings == nil {
		// Create default settings
		settings, err = h.settingsRepo.CreateDefault(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create settings"})
			return
		}
	}

	settings.ActiveThemeID = &req.ThemeID
	if _, err := h.settingsRepo.Update(c.Request.Context(), settings); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update settings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Active theme set successfully"})
}

// GetInstalledThemes handles GET /api/v1/themes/installed
func (h *ThemesHandler) GetInstalledThemes(c *gin.Context) {
	userID := c.GetInt("user_id")

	themes, err := h.installedRepo.GetUserInstalledThemes(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch installed themes"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid page_name"})
		return
	}

	// Check if theme exists
	theme, err := h.themeRepo.GetByID(c.Request.Context(), req.ThemeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch theme"})
		return
	}
	if theme == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Theme not found"})
		return
	}

	override, err := h.themeOverrideRepo.SetOverride(c.Request.Context(), userID, req.PageName, req.ThemeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set page override"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch page override"})
		return
	}

	if override == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No override found for this page"})
		return
	}

	c.JSON(http.StatusOK, override)
}

// GetAllOverrides handles GET /api/v1/themes/overrides
func (h *ThemesHandler) GetAllOverrides(c *gin.Context) {
	userID := c.GetInt("user_id")

	overrides, err := h.themeOverrideRepo.GetAllOverrides(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch overrides"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete page override"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	settings, err := h.settingsRepo.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch settings"})
		return
	}

	if settings == nil {
		settings, err = h.settingsRepo.CreateDefault(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create settings"})
			return
		}
	}

	settings.AdvancedModeEnabled = req.AdvancedModeEnabled
	updated, err := h.settingsRepo.Update(c.Request.Context(), settings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update settings"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request. Rating must be 1-5"})
		return
	}

	var reviewPtr *string
	if req.Review != "" {
		reviewPtr = &req.Review
	}

	if err := h.installedRepo.RateTheme(c.Request.Context(), userID, req.ThemeID, req.Rating, reviewPtr); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to rate theme"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Theme rated successfully"})
}

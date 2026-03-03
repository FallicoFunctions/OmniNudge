package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

type FeatureFlagHandler struct {
	svc *services.FeatureFlagService
}

func NewFeatureFlagHandler(svc *services.FeatureFlagService) *FeatureFlagHandler {
	return &FeatureFlagHandler{svc: svc}
}

// Admin endpoints

// ListFlags returns all feature flags.
// @Summary      List feature flags
// @Tags         FeatureFlags
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}   models.FeatureFlag
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/feature-flags [get]
func (h *FeatureFlagHandler) ListFlags(c *gin.Context) {
	flags, err := h.svc.ListFlags(c.Request.Context())
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to list flags")
		return
	}

	c.JSON(http.StatusOK, gin.H{"flags": flags})
}

// GetFeatureFlag returns a specific feature flag.
// @Summary      Get feature flag
// @Tags         FeatureFlags
// @Security     BearerAuth
// @Produce      json
// @Param        key  path  string  true  "Flag key"
// @Success      200  {object}  models.FeatureFlag
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/feature-flags/{key} [get]
func (h *FeatureFlagHandler) GetFeatureFlag(c *gin.Context) {
	key := c.Param("key")

	flag, err := h.svc.GetFeatureFlag(c.Request.Context(), key)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Flag not found")
		return
	}

	c.JSON(http.StatusOK, flag)
}

// CreateFlag creates a new feature flag.
// @Summary      Create feature flag
// @Tags         FeatureFlags
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      201  {object}  models.FeatureFlag
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/feature-flags [post]
func (h *FeatureFlagHandler) CreateFlag(c *gin.Context) {
	var req struct {
		Key         string `json:"key" binding:"required"`
		Enabled     bool   `json:"enabled"`
		Description string `json:"description" binding:"required"`
		Percentage  *int   `json:"percentage"`
		Environment string `json:"environment"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	if req.Percentage != nil && (*req.Percentage < 0 || *req.Percentage > 100) {
		RespondError(c, http.StatusBadRequest, "Percentage must be 0-100")
		return
	}

	if req.Environment == "" {
		req.Environment = "all"
	}

	flag := &models.FeatureFlag{
		Key:         req.Key,
		Enabled:     req.Enabled,
		Description: req.Description,
		Percentage:  req.Percentage,
		Environment: req.Environment,
		Metadata:    make(map[string]interface{}),
	}

	adminID := int64(c.GetInt("user_id"))
	if err := h.svc.CreateFlag(c.Request.Context(), flag, adminID); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	c.JSON(http.StatusCreated, flag)
}

// UpdateFlag updates an existing feature flag.
// @Summary      Update feature flag
// @Tags         FeatureFlags
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        key  path  string  true  "Flag key"
// @Success      200  {object}  models.FeatureFlag
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/feature-flags/{key} [put]
func (h *FeatureFlagHandler) UpdateFlag(c *gin.Context) {
	key := c.Param("key")

	var req struct {
		Enabled     *bool   `json:"enabled"`
		Description *string `json:"description"`
		Percentage  *int    `json:"percentage"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	if req.Percentage != nil && (*req.Percentage < 0 || *req.Percentage > 100) {
		RespondError(c, http.StatusBadRequest, "Percentage must be 0-100")
		return
	}

	updates := make(map[string]interface{})
	if req.Enabled != nil {
		updates["enabled"] = *req.Enabled
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.Percentage != nil {
		updates["percentage"] = req.Percentage
	}

	adminID := int64(c.GetInt("user_id"))
	if err := h.svc.UpdateFlag(c.Request.Context(), key, updates, adminID); err != nil {
		RespondError(c, http.StatusNotFound, err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DeleteFlag deletes a feature flag.
// @Summary      Delete feature flag
// @Tags         FeatureFlags
// @Security     BearerAuth
// @Produce      json
// @Param        key  path  string  true  "Flag key"
// @Success      204
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/feature-flags/{key} [delete]
func (h *FeatureFlagHandler) DeleteFlag(c *gin.Context) {
	key := c.Param("key")
	adminID := int64(c.GetInt("user_id"))

	if err := h.svc.DeleteFlag(c.Request.Context(), key, adminID); err != nil {
		RespondError(c, http.StatusNotFound, err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// SetOverride sets a per-user flag override.
// @Summary      Set flag override
// @Tags         FeatureFlags
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        key  path  string  true  "Flag key"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/feature-flags/{key}/overrides [post]
func (h *FeatureFlagHandler) SetOverride(c *gin.Context) {
	key := c.Param("key")

	var req struct {
		UserID  int64 `json:"user_id" binding:"required"`
		Enabled bool  `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	adminID := int64(c.GetInt("user_id"))
	if err := h.svc.SetUserOverride(c.Request.Context(), key, req.UserID, req.Enabled, adminID); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// RemoveOverride removes a per-user flag override.
// @Summary      Remove flag override
// @Tags         FeatureFlags
// @Security     BearerAuth
// @Produce      json
// @Param        key     path  string  true  "Flag key"
// @Param        userID  path  int     true  "User ID"
// @Success      204
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/feature-flags/{key}/overrides/{userID} [delete]
func (h *FeatureFlagHandler) RemoveOverride(c *gin.Context) {
	key := c.Param("key")
	userID, err := strconv.ParseInt(c.Param("userID"), 10, 64)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return
	}

	adminID := int64(c.GetInt("user_id"))
	if err := h.svc.RemoveUserOverride(c.Request.Context(), key, userID, adminID); err != nil {
		RespondError(c, http.StatusNotFound, err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GetAuditLog returns the audit log for a feature flag.
// @Summary      Get flag audit log
// @Tags         FeatureFlags
// @Security     BearerAuth
// @Produce      json
// @Param        key  path  string  true  "Flag key"
// @Success      200  {array}   gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/feature-flags/{key}/audit [get]
func (h *FeatureFlagHandler) GetAuditLog(c *gin.Context) {
	key := c.Param("key")
	limit := 100

	logs, err := h.svc.GetAuditLog(c.Request.Context(), key, limit)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get audit log")
		return
	}

	c.JSON(http.StatusOK, gin.H{"audit": logs})
}

// Client endpoint

// GetUserFlags returns enabled feature flags for the current user.
// @Summary      Get my feature flags
// @Tags         FeatureFlags
// @Security     BearerAuth
// @Produce      json
// @Param        keys  query  string  false  "Comma-separated flag keys"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /feature-flags [get]
func (h *FeatureFlagHandler) GetUserFlags(c *gin.Context) {
	userID := int64(c.GetInt("user_id"))

	// Support batch query: ?keys=feature_groups,feature_reactions
	keysParam := c.Query("keys")

	if keysParam != "" {
		// Batch check specific flags
		keys := strings.Split(keysParam, ",")
		result := make(map[string]bool)

		for _, key := range keys {
			key = strings.TrimSpace(key)
			enabled, err := h.svc.IsEnabled(c.Request.Context(), key, &userID)
			if err == nil {
				result[key] = enabled
			}
		}

		c.JSON(http.StatusOK, gin.H{"flags": result})
	} else {
		// Return all enabled flags for user
		flags, err := h.svc.GetUserFlags(c.Request.Context(), userID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to get flags")
			return
		}

		c.JSON(http.StatusOK, gin.H{"flags": flags})
	}
}

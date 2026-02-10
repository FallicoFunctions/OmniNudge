package handlers

import (
	"net/http"
	"strconv"

	"github.com/omninudge/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type FeatureFlagHandler struct {
	svc *services.FeatureFlagService
}

func NewFeatureFlagHandler(svc *services.FeatureFlagService) *FeatureFlagHandler {
	return &FeatureFlagHandler{svc: svc}
}

// GetFlag checks if a feature is enabled for the current user
// GET /api/v1/features/:key
func (h *FeatureFlagHandler) GetFlag(c *gin.Context) {
	key := c.Param("key")
	userID := c.GetInt("user_id")

	enabled, err := h.svc.IsEnabled(c.Request.Context(), key, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check feature flag"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"key":     key,
		"enabled": enabled,
	})
}

// ListFlags returns all feature flags (admin only)
// GET /api/v1/admin/features
func (h *FeatureFlagHandler) ListFlags(c *gin.Context) {
	flags, err := h.svc.ListFlags(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list flags"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"flags": flags})
}

// UpdateFlag updates a feature flag (admin only)
// PUT /api/v1/admin/features/:key
func (h *FeatureFlagHandler) UpdateFlag(c *gin.Context) {
	key := c.Param("key")
	adminID := c.GetInt("user_id")

	var req struct {
		Enabled     *bool                  `json:"enabled"`
		Description *string                `json:"description"`
		Metadata    map[string]interface{} `json:"metadata"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Get existing flag
	flag, err := h.svc.GetFlag(c.Request.Context(), key)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Flag not found"})
		return
	}

	// Update fields
	if req.Enabled != nil {
		flag.Enabled = *req.Enabled
	}
	if req.Description != nil {
		flag.Description = *req.Description
	}
	if req.Metadata != nil {
		flag.Metadata = req.Metadata
	}

	if err := h.svc.SetFlag(c.Request.Context(), flag, adminID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update flag"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"flag": flag})
}

// SetUserOverride sets a user-specific override (admin only)
// POST /api/v1/admin/features/:key/overrides
func (h *FeatureFlagHandler) SetUserOverride(c *gin.Context) {
	key := c.Param("key")
	adminID := c.GetInt("user_id")

	var req struct {
		UserID  int  `json:"user_id" binding:"required"`
		Enabled bool `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	err := h.svc.SetUserOverride(c.Request.Context(), key, req.UserID, req.Enabled, adminID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set override"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Override set successfully"})
}

// RemoveUserOverride removes a user-specific override (admin only)
// DELETE /api/v1/admin/features/:key/overrides/:user_id
func (h *FeatureFlagHandler) RemoveUserOverride(c *gin.Context) {
	key := c.Param("key")
	userIDStr := c.Param("user_id")
	adminID := c.GetInt("user_id")

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user_id"})
		return
	}

	err = h.svc.RemoveUserOverride(c.Request.Context(), key, userID, adminID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove override"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Override removed successfully"})
}

// GetAuditLog returns audit log for a flag (admin only)
// GET /api/v1/admin/features/:key/audit
func (h *FeatureFlagHandler) GetAuditLog(c *gin.Context) {
	key := c.Param("key")
	limitStr := c.DefaultQuery("limit", "50")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 || limit > 100 {
		limit = 50
	}

	entries, err := h.svc.GetAuditLog(c.Request.Context(), key, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get audit log"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"entries": entries})
}

// SetRolloutPercentage sets gradual rollout percentage (admin only)
// POST /api/v1/admin/features/:key/rollout
func (h *FeatureFlagHandler) SetRolloutPercentage(c *gin.Context) {
	key := c.Param("key")
	adminID := c.GetInt("user_id")

	var req struct {
		Percentage float64 `json:"percentage" binding:"required,min=0,max=100"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Percentage must be between 0 and 100"})
		return
	}

	// Get existing flag
	flag, err := h.svc.GetFlag(c.Request.Context(), key)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Flag not found"})
		return
	}

	// Update metadata with rollout percentage
	if flag.Metadata == nil {
		flag.Metadata = make(map[string]interface{})
	}
	flag.Metadata["rollout_percentage"] = req.Percentage

	if err := h.svc.SetFlag(c.Request.Context(), flag, adminID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set rollout percentage"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Rollout percentage updated",
		"percentage": req.Percentage,
	})
}

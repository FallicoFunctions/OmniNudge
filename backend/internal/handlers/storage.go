package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/api/middleware"
	"net/http"

	"github.com/gin-gonic/gin"
)

type StorageHandler struct {
	mediaRepo ports.MediaFileRepository
	quota     MediaQuotaConfig
}

func NewStorageHandler(mediaRepo ports.MediaFileRepository, quota MediaQuotaConfig) *StorageHandler {
	if quota.FreeTierBytes <= 0 {
		quota.FreeTierBytes = 1 * 1024 * 1024 * 1024
	}
	if quota.ProTierBytes <= 0 {
		quota.ProTierBytes = 50 * 1024 * 1024 * 1024
	}
	return &StorageHandler{
		mediaRepo: mediaRepo,
		quota:     quota,
	}
}

// GetMyStorage returns tracked storage usage and quota.
// @Summary      Get my storage usage
// @Tags         Users
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Security     BearerAuth
// @Router       /users/me/storage [get]
func (h *StorageHandler) GetMyStorage(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	used, err := h.mediaRepo.GetTrackedStorageByUserID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get storage usage")
		return
	}

	quota := resolveStorageCapForRole(c.GetString("role"), h.quota)
	percentage := 0.0
	if quota > 0 {
		percentage = (float64(used) / float64(quota)) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"used":       used,
		"quota":      quota,
		"percentage": percentage,
	})
}

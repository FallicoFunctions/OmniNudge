package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/service"
	"github.com/omninudge/backend/internal/utils"
)

type ProfileHandler struct {
	profiles *service.ProfileService
}

func NewProfileHandler(profiles *service.ProfileService) *ProfileHandler {
	return &ProfileHandler{profiles: profiles}
}

func (h *ProfileHandler) SaveLoadout(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		utils.RespondUnauthorized(c, "Unauthorized")
		return
	}

	var payload map[string]string
	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.RespondBadRequest(c, "Invalid request body", err)
		return
	}

	if err := h.profiles.SaveLoadout(c.Request.Context(), userID.(int), payload); err != nil {
		utils.RespondInternalError(c, "Internal Server Error", err)
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *ProfileHandler) SaveReturnPoint(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		utils.RespondUnauthorized(c, "Unauthorized")
		return
	}

	var payload model.SavedPoint
	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.RespondBadRequest(c, "Invalid request body", err)
		return
	}

	if err := h.profiles.SaveReturnPoint(c.Request.Context(), userID.(int), &payload); err != nil {
		utils.RespondInternalError(c, "Internal Server Error", err)
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *ProfileHandler) GetProfile(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		utils.RespondUnauthorized(c, "Unauthorized")
		return
	}

	profile, err := h.profiles.GetProfile(c.Request.Context(), userID.(int))
	if err != nil {
		utils.RespondInternalError(c, "Internal Server Error", err)
		return
	}
	if profile == nil {
		utils.RespondSuccess(c, model.OmniRaveProfile{
			UserID:  userID.(int),
			Loadout: map[string]string{},
		})
		return
	}

	utils.RespondSuccess(c, profile)
}

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

type saveRuntimeSettingsRequest struct {
	UITheme       *string `json:"uiTheme" binding:"required"`
	GraphicsMode  *string `json:"graphicsMode" binding:"required,oneof=auto manual"`
	GraphicsLevel *int    `json:"graphicsLevel,omitempty"`
	DisplayNames  *bool   `json:"displayNames" binding:"required"`
	ChatCollapsed *bool   `json:"chatCollapsed" binding:"required"`
	CrouchMode    *string `json:"crouchMode" binding:"required,oneof=hold toggle"`
	CameraFollow  *string `json:"cameraFollow" binding:"required,oneof=free auto-follow"`
}

type saveLastVenueRequest struct {
	LastVenue string `json:"lastVenue" binding:"required,oneof=main_stage underground plurr_partay"`
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

func (h *ProfileHandler) SaveRuntimeSettings(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		utils.RespondUnauthorized(c, "Unauthorized")
		return
	}

	var payload saveRuntimeSettingsRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.RespondBadRequest(c, "Invalid request body", err)
		return
	}

	settings := model.OmniRaveSettings{
		UITheme:       *payload.UITheme,
		GraphicsMode:  *payload.GraphicsMode,
		DisplayNames:  *payload.DisplayNames,
		ChatCollapsed: *payload.ChatCollapsed,
		CrouchMode:    *payload.CrouchMode,
		CameraFollow:  *payload.CameraFollow,
	}
	if payload.GraphicsLevel != nil {
		settings.GraphicsLevel = *payload.GraphicsLevel
	}

	if err := h.profiles.SaveSettings(c.Request.Context(), userID.(int), settings); err != nil {
		utils.RespondInternalError(c, "Internal Server Error", err)
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *ProfileHandler) SaveLastVenue(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		utils.RespondUnauthorized(c, "Unauthorized")
		return
	}

	var payload saveLastVenueRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.RespondBadRequest(c, "Invalid request body", err)
		return
	}

	if err := h.profiles.SaveLastVenue(c.Request.Context(), userID.(int), payload.LastVenue); err != nil {
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

	utils.RespondSuccess(c, profile)
}

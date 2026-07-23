package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/service"
	omniraveworld "github.com/omninudge/backend/internal/omniraveworld/world"
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
	LastVenue string `json:"lastVenue" binding:"required"`
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

	if err := validateLoadoutPayload(payload); err != nil {
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
	if !isAuthoritativeVenueID(payload.LastVenue) {
		utils.RespondBadRequest(c, "Invalid request body", fmt.Errorf("invalid lastVenue %q", payload.LastVenue))
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

const (
	maxLoadoutKeys      = 32
	maxLoadoutKeyLength = 128
	maxLoadoutValueLen  = 128
)

func validateLoadoutPayload(payload map[string]string) error {
	if len(payload) > maxLoadoutKeys {
		return fmt.Errorf("loadout has too many entries: %d (max %d)", len(payload), maxLoadoutKeys)
	}
	for key, value := range payload {
		if len(key) > maxLoadoutKeyLength {
			return fmt.Errorf("loadout key %q exceeds max length %d", key, maxLoadoutKeyLength)
		}
		if len(value) > maxLoadoutValueLen {
			return fmt.Errorf("loadout value for key %q exceeds max length %d", key, maxLoadoutValueLen)
		}
	}
	return nil
}

func isAuthoritativeVenueID(venue string) bool {
	switch venue {
	case string(omniraveworld.ZoneMainStage), string(omniraveworld.ZoneUnderground), string(omniraveworld.ZonePlurrPartay):
		return true
	default:
		return false
	}
}

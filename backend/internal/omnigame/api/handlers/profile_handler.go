package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	apiresponse "github.com/omninudge/backend/internal/api/response"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/service"
	omniraveworld "github.com/omninudge/backend/internal/omniraveworld/world"
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
		apiresponse.WriteError(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var payload map[string]string
	if err := c.ShouldBindJSON(&payload); err != nil {
		apiresponse.WriteError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := validateLoadoutPayload(payload); err != nil {
		apiresponse.WriteError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.profiles.SaveLoadout(c.Request.Context(), userID.(int), payload); err != nil {
		apiresponse.WriteError(c, http.StatusInternalServerError, "Internal Server Error")
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *ProfileHandler) SaveReturnPoint(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		apiresponse.WriteError(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var payload model.SavedPoint
	if err := c.ShouldBindJSON(&payload); err != nil {
		apiresponse.WriteError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.profiles.SaveReturnPoint(c.Request.Context(), userID.(int), &payload); err != nil {
		apiresponse.WriteError(c, http.StatusInternalServerError, "Internal Server Error")
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *ProfileHandler) SaveRuntimeSettings(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		apiresponse.WriteError(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var payload saveRuntimeSettingsRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		apiresponse.WriteError(c, http.StatusBadRequest, "Invalid request body")
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
		apiresponse.WriteError(c, http.StatusInternalServerError, "Internal Server Error")
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *ProfileHandler) SaveLastVenue(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		apiresponse.WriteError(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var payload saveLastVenueRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		apiresponse.WriteError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	if !isAuthoritativeVenueID(payload.LastVenue) {
		apiresponse.WriteError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.profiles.SaveLastVenue(c.Request.Context(), userID.(int), payload.LastVenue); err != nil {
		apiresponse.WriteError(c, http.StatusInternalServerError, "Internal Server Error")
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *ProfileHandler) GetProfile(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		apiresponse.WriteError(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	profile, err := h.profiles.GetProfile(c.Request.Context(), userID.(int))
	if err != nil {
		apiresponse.WriteError(c, http.StatusInternalServerError, "Internal Server Error")
		return
	}

	c.JSON(http.StatusOK, profile)
}

// validateLoadoutPayload delegates to the single shared bounds check beside
// the Loadout type. The world socket's "loadout" event enforces the exact
// same limits through the same helper, so the persisted profile and the live
// broadcast can never drift apart.
func validateLoadoutPayload(payload map[string]string) error {
	return omniraveworld.ValidateLoadout(payload)
}

func isAuthoritativeVenueID(venue string) bool {
	switch venue {
	case string(omniraveworld.ZoneMainStage), string(omniraveworld.ZoneUnderground), string(omniraveworld.ZonePlurrPartay):
		return true
	default:
		return false
	}
}

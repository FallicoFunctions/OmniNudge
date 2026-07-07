package handlers

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
)

// AdminPersonaHandler manages OmniChat persona media for admins.
type AdminPersonaHandler struct {
	personaRepo *models.BotPersonaRepository
}

// NewAdminPersonaHandler creates a new admin persona handler.
func NewAdminPersonaHandler(personaRepo *models.BotPersonaRepository) *AdminPersonaHandler {
	return &AdminPersonaHandler{personaRepo: personaRepo}
}

type updateAdminPersonaMediaRequest struct {
	AvatarURL       *string `json:"avatar_url"`
	PreviewVideoURL *string `json:"preview_video_url"`
}

// ListPersonas returns all personas for admin management.
func (h *AdminPersonaHandler) ListPersonas(c *gin.Context) {
	if _, ok := middleware.GetAuthenticatedUserID(c); !ok {
		return
	}

	personas, err := h.personaRepo.ListAll(c.Request.Context())
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to list personas")
		return
	}

	c.JSON(http.StatusOK, gin.H{"personas": personas})
}

// UpdatePersonaMedia updates avatar and preview media URLs for a persona.
func (h *AdminPersonaHandler) UpdatePersonaMedia(c *gin.Context) {
	if _, ok := middleware.GetAuthenticatedUserID(c); !ok {
		return
	}

	personaID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid persona ID")
		return
	}

	var req updateAdminPersonaMediaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	avatarURL, ok := normalizePersonaMediaURL(req.AvatarURL)
	if !ok {
		RespondError(c, http.StatusBadRequest, "Avatar URL must be a valid HTTP(S) or upload URL")
		return
	}
	previewVideoURL, ok := normalizePersonaMediaURL(req.PreviewVideoURL)
	if !ok {
		RespondError(c, http.StatusBadRequest, "Preview video URL must be a valid HTTP(S) or upload URL")
		return
	}

	persona, err := h.personaRepo.UpdateMedia(c.Request.Context(), personaID, avatarURL, previewVideoURL)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update persona media")
		return
	}
	if persona == nil {
		RespondError(c, http.StatusNotFound, "Persona not found")
		return
	}

	c.JSON(http.StatusOK, gin.H{"persona": persona})
}

func normalizePersonaMediaURL(raw *string) (*string, bool) {
	if raw == nil {
		return nil, true
	}

	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil, true
	}
	if strings.HasPrefix(trimmed, "/uploads/") {
		return &trimmed, true
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return nil, false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, false
	}
	if parsed.Host == "" {
		return nil, false
	}
	return &trimmed, true
}

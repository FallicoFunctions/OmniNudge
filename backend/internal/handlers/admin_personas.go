package handlers

import (
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// AdminPersonaHandler manages OmniChat persona media and voices for admins.
type AdminPersonaHandler struct {
	personaRepo *models.BotPersonaRepository
	voiceRepo   *models.OmniChatVoiceRepository
}

// NewAdminPersonaHandler creates a new admin persona handler.
func NewAdminPersonaHandler(personaRepo *models.BotPersonaRepository, voiceRepo *models.OmniChatVoiceRepository) *AdminPersonaHandler {
	return &AdminPersonaHandler{personaRepo: personaRepo, voiceRepo: voiceRepo}
}

type updateAdminPersonaMediaRequest struct {
	AvatarURL       *string   `json:"avatar_url"`
	PreviewVideoURL *string   `json:"preview_video_url"`
	GalleryURLs     *[]string `json:"gallery_urls,omitempty"`
}

type updateAdminPersonaVoiceRequest struct {
	PresetID *string `json:"preset_id"`
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

// ListPersonaVoices returns one sanitized voice profile for every persona.
func (h *AdminPersonaHandler) ListPersonaVoices(c *gin.Context) {
	if _, ok := middleware.GetAuthenticatedUserID(c); !ok {
		return
	}

	voices, err := h.voiceRepo.ListPersonaVoices(c.Request.Context())
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to list persona voices")
		return
	}
	publicVoices := make([]*models.OmniChatPersonaVoice, 0, len(voices))
	for _, voice := range voices {
		publicVoices = append(publicVoices, publicOmniChatVoiceProfile(voice))
	}
	c.JSON(http.StatusOK, gin.H{"voices": publicVoices})
}

// UpdatePersonaVoice assigns a canonical server-owned preset, or the browser
// fallback when preset_id is blank. Raw provider settings are never accepted.
func (h *AdminPersonaHandler) UpdatePersonaVoice(c *gin.Context) {
	adminID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	personaID, err := strconv.Atoi(c.Param("id"))
	if err != nil || personaID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid persona ID")
		return
	}

	var req updateAdminPersonaVoiceRequest
	if err := decodeStrictJSON(c, &req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.PresetID == nil {
		RespondError(c, http.StatusBadRequest, "Voice preset is required")
		return
	}

	var voice *models.OmniChatPersonaVoice
	presetID := strings.TrimSpace(*req.PresetID)
	if presetID == "" {
		voice = models.DefaultOmniChatBrowserVoice(personaID)
	} else {
		preset, found := services.FindOmniChatVoicePreset(presetID)
		if !found {
			RespondError(c, http.StatusBadRequest, "Unknown voice preset")
			return
		}
		languageCode := preset.LanguageCode
		voice = &models.OmniChatPersonaVoice{
			PersonaID:       personaID,
			Provider:        preset.Provider,
			VoiceID:         preset.VoiceID,
			VoiceName:       preset.Name,
			ModelID:         preset.ModelID,
			Stability:       0.5,
			SimilarityBoost: 0.75,
			Style:           0,
			Speed:           1,
			Pitch:           1,
			LanguageCode:    &languageCode,
			Active:          true,
		}
	}
	if err := normalizeOmniChatVoiceProfile(voice); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid voice preset")
		return
	}

	updated, err := h.voiceRepo.UpsertPersonaVoiceAuthorized(c.Request.Context(), adminID, voice)
	if err != nil {
		slog.Error("failed to update OmniChat persona voice", "persona_id", personaID, "admin_id", adminID, "error", err)
		RespondError(c, http.StatusInternalServerError, "Failed to update persona voice")
		return
	}
	if !updated {
		RespondError(c, http.StatusNotFound, "Persona not found")
		return
	}
	saved, err := h.voiceRepo.GetPersonaVoice(c.Request.Context(), personaID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load persona voice")
		return
	}
	c.JSON(http.StatusOK, gin.H{"voice": publicOmniChatVoiceProfile(saved)})
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
	if err := decodeStrictJSON(c, &req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	avatarURL, ok := normalizePersonaImageURL(req.AvatarURL)
	if !ok {
		RespondError(c, http.StatusBadRequest, "Avatar URL must be a valid uploaded image URL")
		return
	}
	previewVideoURL, ok := normalizePersonaVideoURL(req.PreviewVideoURL)
	if !ok {
		RespondError(c, http.StatusBadRequest, "Preview video URL must be a valid uploaded video URL")
		return
	}

	var normalizedGallery *[]string
	if req.GalleryURLs != nil {
		galleryURLs := *req.GalleryURLs
		if len(galleryURLs) > maxOmniChatPersonaGalleryURLs {
			RespondError(c, http.StatusBadRequest, fmt.Sprintf("Gallery cannot exceed %d images", maxOmniChatPersonaGalleryURLs))
			return
		}
		gallery := make([]string, 0, len(galleryURLs))
		for _, raw := range galleryURLs {
			normalized, ok := normalizePersonaImageURL(&raw)
			if !ok {
				RespondError(c, http.StatusBadRequest, "Gallery URL must be a valid uploaded image URL")
				return
			}
			if normalized != nil {
				gallery = append(gallery, *normalized)
			}
		}
		normalizedGallery = &gallery
	}

	persona, err := h.personaRepo.UpdateMedia(c.Request.Context(), personaID, avatarURL, previewVideoURL, normalizedGallery)
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

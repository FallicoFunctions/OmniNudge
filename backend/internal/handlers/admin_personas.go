package handlers

import (
	"fmt"
	"net/http"
	"strconv"

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
	AvatarURL       *string   `json:"avatar_url"`
	PreviewVideoURL *string   `json:"preview_video_url"`
	GalleryURLs     *[]string `json:"gallery_urls,omitempty"`
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

package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	zlog "github.com/rs/zerolog/log"
)

type createRoleplayRequest struct {
	RequestID uuid.UUID                        `json:"request_id"`
	Answers   services.RoleplayCreationAnswers `json:"answers"`
}

// GetRoleplayCreationOptions checks the limit before asking someone to finish
// the wizard. CreateRoleplay checks it again inside the insert transaction.
func (h *OmniChatHandler) GetRoleplayCreationOptions(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	if h.personaRepo == nil {
		RespondError(c, http.StatusServiceUnavailable, "Character creation is unavailable")
		return
	}
	owned, err := h.personaRepo.ListOwnedByUser(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusServiceUnavailable, "Could not check your character limit")
		return
	}
	count := 0
	for _, persona := range owned {
		if models.PersonaPerformsAScene(persona) {
			count++
		}
	}
	renderStyles := []string{"realistic"}
	if h.animeImageEndpointConfigured {
		renderStyles = append(renderStyles, "anime")
	}
	c.JSON(http.StatusOK, gin.H{
		"limit":         h.roleplayLimit(c.Request.Context(), userID),
		"owned":         count,
		"catalog":       services.RoleplayCreationCatalog(),
		"render_styles": renderStyles,
	})
}

// CreateRoleplay accepts only guided answers, never a client-authored prompt,
// media URL, or extension blob. The server compiles and owns those fields.
func (h *OmniChatHandler) CreateRoleplay(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	if h.personaRepo == nil {
		RespondError(c, http.StatusServiceUnavailable, "Character creation is unavailable")
		return
	}
	var request createRoleplayRequest
	if err := decodeStrictJSON(c, &request); err != nil || request.RequestID == uuid.Nil {
		RespondError(c, http.StatusBadRequest, "Invalid character creation request")
		return
	}
	if request.Answers.IsNSFW && c.GetString("role") != "admin" {
		RespondError(c, http.StatusForbidden, "Only admins can create 18+ characters")
		return
	}
	if request.Answers.RenderStyle == models.OmniChatRenderStyleAnime && !h.animeImageEndpointConfigured {
		RespondError(c, http.StatusServiceUnavailable, "Anime portraits are unavailable right now")
		return
	}
	persona, err := services.BuildRoleplayPersona(request.Answers)
	if err != nil {
		if errors.Is(err, services.ErrRoleplayCreationAnswers) {
			RespondError(c, http.StatusBadRequest, err.Error())
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to prepare character")
		return
	}
	// A replay whose response could not be recorded must never make a second
	// character. The stable slug makes a retry collide with the first insert.
	persona.Slug = fmt.Sprintf("rp-%d-%s", userID, request.RequestID)
	claim, ok := h.claimOmniChatRequest(c, userID, request.RequestID,
		"roleplay_create", fmt.Sprintf("user:%d", userID), request.Answers)
	if !ok {
		return
	}
	if claim.Replay {
		var prior struct {
			ID int `json:"id"`
		}
		if err := json.Unmarshal(claim.Response, &prior); err != nil || prior.ID <= 0 {
			RespondError(c, http.StatusServiceUnavailable, "Could not verify the previous character")
			return
		}
		active, err := h.personaRepo.GetOwnedByUserAndID(c.Request.Context(), userID, prior.ID)
		if err != nil {
			RespondError(c, http.StatusServiceUnavailable, "Could not verify the previous character")
			return
		}
		if active == nil {
			RespondError(c, http.StatusConflict, "This request already created a character that was deleted. Start a new character.")
			return
		}
		c.Data(http.StatusOK, "application/json", claim.Response)
		return
	}
	completed := false
	defer func() {
		if !completed {
			h.failOmniChatRequest(userID, request.RequestID)
		}
	}()
	limit := h.roleplayLimit(c.Request.Context(), userID)
	created, newlyCreated, err := h.personaRepo.CreateOwnedWithClaim(c.Request.Context(), userID, persona, limit, request.RequestID)
	if err != nil {
		if errors.Is(err, models.ErrRoleplayLimitReached) {
			respondRoleplayLimit(c, limit)
			return
		}
		if errors.Is(err, models.ErrRoleplayRequestAlreadyDeleted) {
			RespondError(c, http.StatusConflict, "This request already created a character that was deleted. Start a new character.")
			return
		}
		zlog.Error().Err(err).Int("user_id", userID).Msg("omnichat roleplay creation failed")
		RespondError(c, http.StatusInternalServerError, "Failed to create character")
		return
	}
	completed = true
	if newlyCreated && h.likeness != nil {
		detached := context.WithoutCancel(c.Request.Context())
		go func() {
			renderCtx, cancel := context.WithTimeout(detached, omniChatLikenessStartTimeout)
			defer cancel()
			started, likenessErr := h.likeness.Start(renderCtx, created)
			if likenessErr != nil {
				zlog.Error().Err(likenessErr).Int("persona_id", created.ID).Int("started", len(started)).
					Msg("omnichat roleplay likeness could not start")
			}
		}()
	}
	if !newlyCreated {
		c.JSON(http.StatusOK, created)
		return
	}
	c.JSON(http.StatusCreated, created)
}

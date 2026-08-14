package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	apiresponse "github.com/omninudge/backend/internal/api/response"
	"github.com/omninudge/backend/internal/services"
)

type WorldEventHandler struct {
	memory *services.OmniChatMemoryService
}

func NewWorldEventHandler(memory *services.OmniChatMemoryService) *WorldEventHandler {
	return &WorldEventHandler{memory: memory}
}

// worldEventRequest is what OmniRave reports about a resident.
//
// There is no persona field, and adding one would be a defect rather than a
// convenience: the character is named inside the signed credential, so one
// credential can only ever write to the character it was issued for. A body
// field would let a credential for any resident write memories into every
// other one.
type worldEventRequest struct {
	Title   string `json:"title"`
	Summary string `json:"summary"`
}

// RecordOmniRave files what a resident did in OmniRave as one of its own
// memories.
func (h *WorldEventHandler) RecordOmniRave(c *gin.Context) {
	value, ok := c.Get(middleware.WorldEventContextKey)
	if !ok {
		apiresponse.WriteError(c, http.StatusUnauthorized, "Unauthorized")
		return
	}
	personaID, ok := value.(int64)
	if !ok || personaID <= 0 {
		apiresponse.WriteError(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if h.memory == nil {
		// Started without a database, so there is nowhere for a memory to go.
		// Saying so is the honest answer; accepting the call and dropping it
		// would let the world believe a character remembers something it does
		// not.
		apiresponse.WriteError(c, http.StatusServiceUnavailable, "Character memory is unavailable")
		return
	}

	var request worldEventRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		apiresponse.WriteError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	// An event with nothing in it is the world's mistake to fix rather than an
	// outage, and it is the only rejection the memory layer makes about the
	// text itself -- oversized titles are clamped there, not refused.
	if strings.TrimSpace(request.Title) == "" || strings.TrimSpace(request.Summary) == "" {
		apiresponse.WriteError(c, http.StatusBadRequest, "A world event needs a title and a summary")
		return
	}

	episodeID, err := h.memory.RecordWorldEvent(c.Request.Context(), int(personaID), request.Title, request.Summary)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrOmniChatMemoryNotResident):
			// One message for "no such character", "not a platform character",
			// "private" and "retired" alike, matching admission. Only platform
			// characters are residents, so only they have a self tier at all.
			apiresponse.WriteError(c, http.StatusForbidden, "Persona has no self-tier memory")
		case errors.Is(err, services.ErrOmniChatMemoryUnavailable):
			apiresponse.WriteError(c, http.StatusServiceUnavailable, "Character memory is unavailable")
		default:
			apiresponse.WriteError(c, http.StatusInternalServerError, "Internal Server Error")
		}
		return
	}

	c.JSON(http.StatusCreated, gin.H{"episodeId": episodeID})
}

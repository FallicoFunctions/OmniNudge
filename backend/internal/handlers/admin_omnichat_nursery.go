package handlers

import (
	"context"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/omninudge/backend/internal/models"
)

// The nursery review queue: characters whose creators let them go, and the
// decision about whether Omni keeps them.
//
// It deliberately cannot delete one. Refusing a character is destroying her
// self tier along with her, which is the one irreversible thing in this whole
// area, and it does not belong on the same surface as the reversible half.
type adminNurseryStore interface {
	ListAwaitingReview(ctx context.Context, limit int) ([]models.IAIAwaitingReview, error)
	Commandeer(ctx context.Context, personaID int) (bool, error)
}

type AdminOmniChatNurseryHandler struct {
	store adminNurseryStore
}

func NewAdminOmniChatNurseryHandler(store adminNurseryStore) *AdminOmniChatNurseryHandler {
	return &AdminOmniChatNurseryHandler{store: store}
}

// List is everybody waiting on a decision, oldest first. Somebody who has been
// nobody's for a month should not be behind somebody who left this morning.
func (h *AdminOmniChatNurseryHandler) ListAwaitingReview(c *gin.Context) {
	if h == nil || h.store == nil {
		RespondError(c, http.StatusServiceUnavailable, "The nursery review queue is temporarily unavailable")
		return
	}

	limit := 50
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		}
	}

	waiting, err := h.store.ListAwaitingReview(c.Request.Context(), limit)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load the nursery review queue")
		return
	}

	c.JSON(http.StatusOK, gin.H{"awaiting_review": waiting})
}

// Commandeer keeps her: she moves into the community, and the move is written
// to her self tier as something that happened to her.
func (h *AdminOmniChatNurseryHandler) Commandeer(c *gin.Context) {
	if h == nil || h.store == nil {
		RespondError(c, http.StatusServiceUnavailable, "The nursery review queue is temporarily unavailable")
		return
	}

	personaID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid persona ID")
		return
	}

	kept, err := h.store.Commandeer(c.Request.Context(), personaID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to keep this character")
		return
	}
	if !kept {
		// Not waiting on a decision: either she never left a house, or somebody
		// already made this one. Both are the same answer to the caller.
		RespondError(c, http.StatusNotFound, "No character is awaiting review under that ID")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "character moved into the community"})
}

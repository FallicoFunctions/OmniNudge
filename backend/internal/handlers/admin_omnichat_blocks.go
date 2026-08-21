package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
)

// The review queue reads and reverses decisions. It deliberately cannot create
// one: a block is a character's judgment, and an admin adding blocks by hand
// through the same surface that audits them would make the record unable to say
// which is which.
type adminOmniChatBlockStore interface {
	ListForAdmin(ctx context.Context, personaID *int, limit, offset int) ([]*models.OmniChatPersonaBlockAdminSummary, int, error)
	Overturn(ctx context.Context, blockID int64, adminUserID int, note string) (*models.OmniChatPersonaBlock, error)
}

type AdminOmniChatBlockHandler struct {
	store adminOmniChatBlockStore
}

func NewAdminOmniChatBlockHandler(store adminOmniChatBlockStore) *AdminOmniChatBlockHandler {
	return &AdminOmniChatBlockHandler{store: store}
}

const maxOmniChatBlockOverturnNoteRunes = 1000

func (h *AdminOmniChatBlockHandler) List(c *gin.Context) {
	if h == nil || h.store == nil {
		RespondError(c, http.StatusServiceUnavailable, "Block review is temporarily unavailable")
		return
	}

	limit, offset := 50, 0
	if raw := c.Query("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 200 {
			RespondError(c, http.StatusBadRequest, "Invalid limit")
			return
		}
		limit = parsed
	}
	if raw := c.Query("offset"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 0 {
			RespondError(c, http.StatusBadRequest, "Invalid offset")
			return
		}
		offset = parsed
	}

	var personaID *int
	if raw := c.Query("persona_id"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			RespondError(c, http.StatusBadRequest, "Invalid persona filter")
			return
		}
		personaID = &parsed
	}

	blocks, total, err := h.store.ListForAdmin(c.Request.Context(), personaID, limit, offset)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load blocks")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"blocks": blocks,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

type adminOmniChatBlockOverturnRequest struct {
	Note string `json:"note"`
}

// Overturn reverses one block. The person is let back in immediately rather
// than at the original expiry, which is the only behaviour that helps somebody
// wrongly shut out of a character they liked.
func (h *AdminOmniChatBlockHandler) Overturn(c *gin.Context) {
	if h == nil || h.store == nil {
		RespondError(c, http.StatusServiceUnavailable, "Block review is temporarily unavailable")
		return
	}

	adminUserID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	blockID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || blockID < 1 {
		RespondError(c, http.StatusBadRequest, "Invalid block ID")
		return
	}

	var req adminOmniChatBlockOverturnRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	note := strings.TrimSpace(req.Note)
	if len([]rune(note)) > maxOmniChatBlockOverturnNoteRunes {
		RespondError(c, http.StatusBadRequest, "Overturn note is too long")
		return
	}

	block, err := h.store.Overturn(c.Request.Context(), blockID, adminUserID, note)
	if err != nil {
		if errors.Is(err, models.ErrOmniChatBlockNotFound) {
			// Absent and already-overturned are one answer on purpose: there is
			// nothing here to reverse, and distinguishing them would confirm
			// whether a given block id exists.
			RespondError(c, http.StatusNotFound, "No block to overturn")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to overturn block")
		return
	}

	c.JSON(http.StatusOK, gin.H{"block": block})
}

package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
)

// omniChatMemoryListLimit bounds one page of memories. Provenance review is a
// browsing task, not an export; the full record is available through the data
// export, which is the surface built for taking everything at once. The
// response reports the true total so a truncated page is visible as one.
const omniChatMemoryListLimit = 100

// OmniChatMemoryHandler exposes what a character remembers about the person
// talking to it.
//
// This exists because memory is inferred rather than authored. A user can
// always see what they typed, but until now they could not see what was
// concluded from it, and could not correct a conclusion that was wrong. The
// provenance carried on each episode is only meaningful if there is somewhere
// to read it.
type OmniChatMemoryHandler struct {
	memory *models.OmniChatMemoryRepository
}

func NewOmniChatMemoryHandler(memory *models.OmniChatMemoryRepository) *OmniChatMemoryHandler {
	return &OmniChatMemoryHandler{memory: memory}
}

// omniChatMemoryResponse is a deliberate projection rather than the stored
// model.
//
// OmniChatMemoryEpisode marks its ownership and provenance fields json:"-" so
// they cannot leak wherever the struct happens to be serialized. The owner is
// entitled to see the provenance of claims made about them, so it is restated
// here explicitly, for this endpoint only.
type omniChatMemoryResponse struct {
	ID              int64 `json:"id"`
	PersonaID       int   `json:"persona_id"`
	ConversationID  int   `json:"conversation_id"`
	SourceMessageID int   `json:"source_message_id,omitempty"`
	// IsSelf marks a memory as the character's own rather than a shared one.
	// A client has to be able to tell them apart for two reasons: presenting
	// the character's life as though the reader were there would be a lie, and
	// a self-tier memory is not the reader's to forget, so no correction
	// control belongs on it.
	IsSelf           bool      `json:"is_self"`
	Title            string    `json:"title"`
	Summary          string    `json:"summary"`
	Salience         float64   `json:"salience"`
	Distinctiveness  float64   `json:"distinctiveness"`
	EmotionalValence *float64  `json:"emotional_valence"`
	RecordedAt       time.Time `json:"recorded_at"`
}

// ListConversationMemories returns what the character took away from one
// conversation, and the life it led away from it.
//
// Both tiers are shown because the character already draws on both when it
// speaks. It can tell someone it wandered the main stage of a world they were
// never in, and until this listing carried the self tier there was nowhere to
// go and check. The self tier belongs to nobody and every user of that
// character can already recall it, so surfacing it discloses nothing; each
// entry says which tier it is in so the two are never presented as the same
// kind of thing.
//
// @Summary      List character memories for a conversation
// @Tags         OmniChat
// @Security     BearerAuth
// @Produce      json
// @Param        id path int true "Conversation ID"
// @Success      200 {object} gin.H
// @Failure      400 {object} gin.H
// @Failure      401 {object} gin.H
// @Router       /omnichat/conversations/{id}/memories [get]
func (h *OmniChatMemoryHandler) ListConversationMemories(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil || conversationID < 1 {
		RespondError(c, http.StatusBadRequest, "Invalid conversation id")
		return
	}
	if h.memory == nil {
		RespondError(c, http.StatusServiceUnavailable, "Character memory is unavailable")
		return
	}

	// Scoping is by owner, not by conversation alone. A conversation id is
	// guessable, so an unowned one must read as empty rather than as someone
	// else's history.
	episodes, total, err := h.memory.ListForConversation(c.Request.Context(), conversationID, userID, omniChatMemoryListLimit)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load memories")
		return
	}

	memories := make([]omniChatMemoryResponse, 0, len(episodes))
	for _, episode := range episodes {
		if episode == nil {
			continue
		}
		memories = append(memories, omniChatMemoryResponse{
			ID:               episode.ID,
			PersonaID:        episode.PersonaID,
			ConversationID:   episode.ConversationID,
			SourceMessageID:  episode.SourceMessageID,
			IsSelf:           episode.IsSelf,
			Title:            episode.Title,
			Summary:          episode.Summary,
			Salience:         episode.Salience,
			Distinctiveness:  episode.Distinctiveness,
			EmotionalValence: episode.EmotionalValence,
			RecordedAt:       episode.RecordedAt,
		})
	}

	// total counts every active memory, not just this page, so a truncated list
	// can say so instead of quietly presenting itself as the whole record.
	c.JSON(http.StatusOK, gin.H{
		"total":    total,
		"has_more": total > len(memories),
		"memories": memories,
	})
}

// ForgetMemory withdraws one memory from recall.
//
// This is a correction, not a deletion: the row is retained with its provenance
// so the record of what was inferred, and from where, survives the user
// disagreeing with it. Recall filters on status, so a hidden memory stops
// influencing replies immediately.
//
// @Summary      Forget a character memory
// @Tags         OmniChat
// @Security     BearerAuth
// @Produce      json
// @Param        id path int true "Memory ID"
// @Success      200 {object} gin.H
// @Failure      400 {object} gin.H
// @Failure      401 {object} gin.H
// @Failure      404 {object} gin.H
// @Router       /omnichat/memories/{id} [delete]
func (h *OmniChatMemoryHandler) ForgetMemory(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	episodeID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || episodeID < 1 {
		RespondError(c, http.StatusBadRequest, "Invalid memory id")
		return
	}
	if h.memory == nil {
		RespondError(c, http.StatusServiceUnavailable, "Character memory is unavailable")
		return
	}

	// HideOwned matches on owner as well as id, so another user's memory is
	// indistinguishable from one that does not exist. A self-tier memory is
	// owned by nobody, and no owner id equals NULL, so it is refused by the
	// same clause: the character's own life is not the reader's to take away.
	if err := h.memory.HideOwned(c.Request.Context(), episodeID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			RespondError(c, http.StatusNotFound, "Memory not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to forget memory")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "memory forgotten"})
}

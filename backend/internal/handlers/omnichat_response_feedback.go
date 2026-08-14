package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
)

type omniChatResponseFeedbackStore interface {
	CreateOwned(
		context.Context,
		int,
		int,
		int,
		models.OmniChatResponseFeedbackReason,
		string,
	) (*models.OmniChatResponseFeedback, error)
}

type OmniChatResponseFeedbackHandler struct {
	store omniChatResponseFeedbackStore
}

func NewOmniChatResponseFeedbackHandler(store omniChatResponseFeedbackStore) *OmniChatResponseFeedbackHandler {
	return &OmniChatResponseFeedbackHandler{store: store}
}

type omniChatResponseFeedbackRequest struct {
	Reason models.OmniChatResponseFeedbackReason `json:"reason" binding:"required"`
	Note   string                                `json:"note"`
}

func (h *OmniChatResponseFeedbackHandler) Submit(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil || conversationID < 1 {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}
	messageID, err := strconv.Atoi(c.Param("message_id"))
	if err != nil || messageID < 1 {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}
	var request omniChatResponseFeedbackRequest
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid response feedback")
		return
	}
	request.Note = strings.TrimSpace(request.Note)
	if !models.ValidOmniChatResponseFeedbackReason(request.Reason) || utf8.RuneCountInString(request.Note) > 1000 {
		RespondError(c, http.StatusBadRequest, "Invalid response feedback")
		return
	}
	if h == nil || h.store == nil {
		RespondError(c, http.StatusServiceUnavailable, "Response feedback is temporarily unavailable")
		return
	}

	feedback, err := h.store.CreateOwned(
		c.Request.Context(),
		userID,
		conversationID,
		messageID,
		request.Reason,
		request.Note,
	)
	if err != nil {
		if errors.Is(err, models.ErrOmniChatConversationNotOwned) {
			RespondError(c, http.StatusNotFound, "Message not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to save response feedback")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"feedback": feedback})
}

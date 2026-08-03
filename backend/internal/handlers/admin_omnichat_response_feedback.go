package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
)

type adminOmniChatResponseFeedbackStore interface {
	ListForAdmin(context.Context, *models.OmniChatResponseFeedbackStatus, *models.OmniChatResponseFeedbackReason, int, int) ([]*models.OmniChatResponseFeedbackAdminSummary, int, error)
	GetForAdmin(context.Context, uuid.UUID) (*models.OmniChatResponseFeedbackAdminDetail, error)
	TransitionStatusForAdmin(context.Context, uuid.UUID, models.OmniChatResponseFeedbackStatus) (*models.OmniChatResponseFeedbackAdminDetail, error)
}
type AdminOmniChatResponseFeedbackHandler struct {
	store adminOmniChatResponseFeedbackStore
}

func NewAdminOmniChatResponseFeedbackHandler(store adminOmniChatResponseFeedbackStore) *AdminOmniChatResponseFeedbackHandler {
	return &AdminOmniChatResponseFeedbackHandler{store: store}
}

func (h *AdminOmniChatResponseFeedbackHandler) List(c *gin.Context) {
	if h == nil || h.store == nil {
		RespondError(c, http.StatusServiceUnavailable, "Response feedback is temporarily unavailable")
		return
	}
	limit, offset := 50, 0
	var err error
	if raw := c.Query("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 100 {
			RespondError(c, 400, "Invalid limit")
			return
		}
	}
	if raw := c.Query("offset"); raw != "" {
		offset, err = strconv.Atoi(raw)
		if err != nil || offset < 0 {
			RespondError(c, 400, "Invalid offset")
			return
		}
	}
	var status *models.OmniChatResponseFeedbackStatus
	if raw := c.Query("status"); raw != "" {
		value := models.OmniChatResponseFeedbackStatus(raw)
		if !models.ValidOmniChatResponseFeedbackStatus(value) {
			RespondError(c, http.StatusBadRequest, "Invalid feedback status filter")
			return
		}
		status = &value
	}
	var reason *models.OmniChatResponseFeedbackReason
	if raw := c.Query("reason"); raw != "" {
		value := models.OmniChatResponseFeedbackReason(raw)
		if !models.ValidOmniChatResponseFeedbackReason(value) {
			RespondError(c, http.StatusBadRequest, "Invalid feedback reason filter")
			return
		}
		reason = &value
	}
	items, total, err := h.store.ListForAdmin(c.Request.Context(), status, reason, limit, offset)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load response feedback")
		return
	}
	c.JSON(200, gin.H{"feedback": items, "total": total, "limit": limit, "offset": offset})
}
func (h *AdminOmniChatResponseFeedbackHandler) Get(c *gin.Context) {
	if h == nil || h.store == nil {
		RespondError(c, http.StatusServiceUnavailable, "Response feedback is temporarily unavailable")
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		RespondError(c, 400, "Invalid feedback ID")
		return
	}
	item, err := h.store.GetForAdmin(c.Request.Context(), id)
	if err != nil {
		RespondError(c, 500, "Failed to load response feedback")
		return
	}
	if item == nil {
		RespondError(c, 404, "Response feedback not found")
		return
	}
	c.JSON(200, gin.H{"feedback": item})
}

type transitionOmniChatResponseFeedbackRequest struct {
	Status models.OmniChatResponseFeedbackStatus `json:"status"`
}

func (h *AdminOmniChatResponseFeedbackHandler) Transition(c *gin.Context) {
	if h == nil || h.store == nil {
		RespondError(c, http.StatusServiceUnavailable, "Response feedback is temporarily unavailable")
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		RespondError(c, 400, "Invalid feedback ID")
		return
	}
	var request transitionOmniChatResponseFeedbackRequest
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, 400, "Invalid request body")
		return
	}
	if !models.ValidOmniChatResponseFeedbackStatus(request.Status) || request.Status == models.OmniChatFeedbackStatusNew {
		RespondError(c, http.StatusBadRequest, "Invalid feedback status")
		return
	}
	item, err := h.store.TransitionStatusForAdmin(c.Request.Context(), id, request.Status)
	if errors.Is(err, context.Canceled) {
		return
	}
	if errors.Is(err, models.ErrOmniChatResponseFeedbackInvalidTransition) {
		RespondError(c, http.StatusConflict, "Invalid feedback status transition")
		return
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update response feedback")
		return
	}
	if item == nil {
		RespondError(c, 404, "Response feedback not found")
		return
	}
	c.JSON(200, gin.H{"feedback": item})
}

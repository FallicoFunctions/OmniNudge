package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/websocket"
)

// GroupKeyHandler serves a group's key versions. The server stores only the
// wrapped copies and never a key itself, so both routes are open to members of
// the group and to nobody else.
type GroupKeyHandler struct {
	keys *services.GroupKeyService
	hub  HubInterface
}

func NewGroupKeyHandler(keys *services.GroupKeyService, hub HubInterface) *GroupKeyHandler {
	return &GroupKeyHandler{keys: keys, hub: hub}
}

// announceShared tells each member who was just given older key versions. Their
// app remembered those versions as missing, and without this would keep
// showing the old messages as unreadable until the page reloaded.
func (h *GroupKeyHandler) announceShared(conversationID int, history map[int]map[int]string) {
	if h.hub == nil {
		return
	}
	given := map[int]bool{}
	for _, copies := range history {
		for member := range copies {
			given[member] = true
		}
	}
	for member := range given {
		h.hub.Broadcast(&websocket.Message{
			RecipientID: member,
			Type:        "group_keys_shared",
			Payload:     gin.H{"conversation_id": conversationID},
		})
	}
}

func groupKeyConversationID(c *gin.Context) (int, bool) {
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return 0, false
	}
	return conversationID, true
}

// GetGroupKeys returns the member's own copies and, when the group needs a new
// version, what that version must cover.
// @Summary      Get group key state
// @Tags         Groups
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  services.GroupKeyState
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /groups/{id}/keys [get]
func (h *GroupKeyHandler) GetGroupKeys(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	conversationID, ok := groupKeyConversationID(c)
	if !ok {
		return
	}

	state, err := h.keys.State(c.Request.Context(), conversationID, userID)
	switch {
	case err == nil:
		c.JSON(http.StatusOK, state)
	case errors.Is(err, services.ErrNotGroupMember):
		RespondError(c, http.StatusForbidden, "Not a member of this group")
	default:
		slog.Error("read group key state failed", "error", err, "conversation_id", conversationID, "user_id", userID)
		RespondError(c, http.StatusInternalServerError, "Failed to read the group keys")
	}
}

// RotateGroupKey stores the next key version, wrapped by the sender for every
// current member.
// @Summary      Store the next group key version
// @Tags         Groups
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      201  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      409  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /groups/{id}/keys [post]
func (h *GroupKeyHandler) RotateGroupKey(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	conversationID, ok := groupKeyConversationID(c)
	if !ok {
		return
	}

	var req services.GroupKeyRotation
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	err := h.keys.Rotate(c.Request.Context(), conversationID, userID, &req)
	switch {
	case err == nil:
		h.announceShared(conversationID, req.History)
		c.JSON(http.StatusCreated, gin.H{"key_version": req.KeyVersion})
	case errors.Is(err, services.ErrNotGroupMember):
		RespondError(c, http.StatusForbidden, "Not a member of this group")
	// Each refusal carries its own reason. Three of these are 409s, and a code
	// derived from the status alone makes them one opaque answer: a client
	// could then tell them apart only by matching the message, which is a
	// contract in two languages that reworing one line would silently break.
	case errors.Is(err, services.ErrGroupKeyCurrent):
		// Somebody else made a version, or no member has joined or left since.
		RespondErrorCoded(c, http.StatusConflict, "group_key_current", "The group key is current")
	case errors.Is(err, services.ErrGroupKeyVersion):
		RespondErrorCoded(c, http.StatusConflict, "group_key_version_taken", "That is not the next key version")
	case errors.Is(err, services.ErrGroupKeyCopies):
		RespondErrorCoded(c, http.StatusBadRequest, "group_key_copies_mismatch", "The key copies do not match the group's members")
	case errors.Is(err, services.ErrGroupKeyHistory):
		RespondErrorCoded(c, http.StatusBadRequest, "group_key_history_not_allowed", "Those older key copies are not allowed")
	case errors.Is(err, services.ErrGroupKeyNoPublicKey):
		// Not the sender's doing: a member has never published a key, so no
		// client can wrap the next version for them.
		RespondErrorCoded(c, http.StatusConflict, "group_key_member_not_set_up", "A member has not set up encryption yet")
	default:
		slog.Error("store group key version failed", "error", err, "conversation_id", conversationID, "user_id", userID)
		RespondError(c, http.StatusInternalServerError, "Failed to store the group key")
	}
}

// ShareGroupKeyHistory stores older key versions for members who lack them,
// outside a rotation: the way a group that turned its history on later lets
// the members it already had read what came before.
// @Summary      Share older group key versions
// @Tags         Groups
// @Security     BearerAuth
// @Accept       json
// @Param        id    path  int  true  "Group conversation ID"
// @Success      204
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /groups/{id}/keys/history [post]
func (h *GroupKeyHandler) ShareGroupKeyHistory(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	conversationID, ok := groupKeyConversationID(c)
	if !ok {
		return
	}

	var req struct {
		History map[int]map[int]string `json:"history"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	err := h.keys.ShareHistory(c.Request.Context(), conversationID, userID, req.History)
	switch {
	case err == nil:
		h.announceShared(conversationID, req.History)
		c.Status(http.StatusNoContent)
	case errors.Is(err, services.ErrNotGroupMember):
		RespondError(c, http.StatusForbidden, "Not a member of this group")
	case errors.Is(err, services.ErrGroupKeyHistory):
		RespondErrorCoded(c, http.StatusBadRequest, "group_key_history_not_allowed", "Those older key copies are not allowed")
	default:
		slog.Error("share group key history failed", "error", err, "conversation_id", conversationID, "user_id", userID)
		RespondError(c, http.StatusInternalServerError, "Failed to share the group key history")
	}
}

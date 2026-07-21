package handlers

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

type OmniChatGroupActions interface {
	SendMessage(ctx context.Context, groupID uuid.UUID, userID int, content string, replyToID *uuid.UUID, responderPersonaIDs []int) ([]*models.OmniChatGroupMessage, error)
	CreateInvite(ctx context.Context, groupID uuid.UUID, creatorUserID int, inviteeUserID *int, maxUses int) (string, *models.OmniChatGroupInvite, error)
	AcceptInvite(ctx context.Context, rawToken string, userID int) (*models.OmniChatGroup, error)
}

type OmniChatGroupData interface {
	CreateGroup(ctx context.Context, ownerUserID int, name, description string, personaIDs []int) (*models.OmniChatGroup, error)
	GetGroupForMember(ctx context.Context, groupID uuid.UUID, userID int) (*models.OmniChatGroup, error)
	ListGroupsForUser(ctx context.Context, userID int, before *models.OmniChatGroupCursor, limit int) ([]*models.OmniChatGroup, error)
	ListMessagesForMember(ctx context.Context, groupID uuid.UUID, userID int, before *models.OmniChatGroupMessageCursor, limit int) ([]*models.OmniChatGroupMessage, error)
}

type OmniChatGroupHandler struct {
	actions OmniChatGroupActions
	data    OmniChatGroupData
}

func NewOmniChatGroupHandler(actions OmniChatGroupActions, data OmniChatGroupData) *OmniChatGroupHandler {
	return &OmniChatGroupHandler{actions: actions, data: data}
}

func (h *OmniChatGroupHandler) CreateGroup(c *gin.Context) {
	var request struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		PersonaIDs  []int  `json:"persona_ids"`
	}
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid group request")
		return
	}
	request.Name = strings.Join(strings.Fields(request.Name), " ")
	request.Description = strings.TrimSpace(request.Description)
	if request.Name == "" || utf8.RuneCountInString(request.Name) > 100 || utf8.RuneCountInString(request.Description) > 1000 || len(request.PersonaIDs) > 10 {
		RespondError(c, http.StatusBadRequest, "Invalid group request")
		return
	}
	group, err := h.data.CreateGroup(c.Request.Context(), c.GetInt("user_id"), request.Name, request.Description, request.PersonaIDs)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create group")
		return
	}
	if group == nil {
		RespondError(c, http.StatusNotFound, "One or more characters were not found")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"group": group})
}

func (h *OmniChatGroupHandler) ListGroups(c *gin.Context) {
	var before *models.OmniChatGroupCursor
	if raw := strings.TrimSpace(c.Query("before")); raw != "" {
		parsed, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
			return
		}
		beforeID, err := uuid.Parse(strings.TrimSpace(c.Query("before_id")))
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
			return
		}
		before = &models.OmniChatGroupCursor{LastMessageAt: parsed, ID: beforeID}
	} else if strings.TrimSpace(c.Query("before_id")) != "" {
		RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
		return
	}
	groups, err := h.data.ListGroupsForUser(c.Request.Context(), c.GetInt("user_id"), before, parseBoundedLimit(c, 50, 100))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load groups")
		return
	}
	c.JSON(http.StatusOK, gin.H{"groups": groups})
}

func (h *OmniChatGroupHandler) GetGroup(c *gin.Context) {
	groupID, ok := parseUUIDParam(c, "group_id")
	if !ok {
		return
	}
	group, err := h.data.GetGroupForMember(c.Request.Context(), groupID, c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load group")
		return
	}
	if group == nil {
		RespondError(c, http.StatusNotFound, "Group not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"group": group})
}

func (h *OmniChatGroupHandler) ListMessages(c *gin.Context) {
	groupID, ok := parseUUIDParam(c, "group_id")
	if !ok {
		return
	}
	var before *models.OmniChatGroupMessageCursor
	if raw := strings.TrimSpace(c.Query("before")); raw != "" {
		parsed, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
			return
		}
		beforeID, err := uuid.Parse(strings.TrimSpace(c.Query("before_id")))
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
			return
		}
		before = &models.OmniChatGroupMessageCursor{CreatedAt: parsed, ID: beforeID}
	} else if strings.TrimSpace(c.Query("before_id")) != "" {
		RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
		return
	}
	messages, err := h.data.ListMessagesForMember(c.Request.Context(), groupID, c.GetInt("user_id"), before, parseBoundedLimit(c, 100, 200))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load group messages")
		return
	}
	if messages == nil {
		RespondError(c, http.StatusNotFound, "Group not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

func (h *OmniChatGroupHandler) SendMessage(c *gin.Context) {
	groupID, ok := parseUUIDParam(c, "group_id")
	if !ok {
		return
	}
	var request struct {
		Content             string     `json:"content"`
		ReplyToID           *uuid.UUID `json:"reply_to_id"`
		ResponderPersonaIDs []int      `json:"responder_persona_ids"`
	}
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid group message")
		return
	}
	messages, err := h.actions.SendMessage(c.Request.Context(), groupID, c.GetInt("user_id"), request.Content, request.ReplyToID, request.ResponderPersonaIDs)
	if errors.Is(err, services.ErrOmniChatSocialInvalidInput) {
		RespondError(c, http.StatusBadRequest, "Invalid group message")
		return
	}
	if errors.Is(err, services.ErrNotFound) {
		RespondError(c, http.StatusNotFound, "Group or character not found")
		return
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to send group message")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"messages": messages})
}

func (h *OmniChatGroupHandler) CreateInvite(c *gin.Context) {
	groupID, ok := parseUUIDParam(c, "group_id")
	if !ok {
		return
	}
	var request struct {
		InviteeUserID *int `json:"invitee_user_id"`
		MaxUses       int  `json:"max_uses"`
	}
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid invite request")
		return
	}
	if request.MaxUses == 0 {
		request.MaxUses = 1
	}
	token, invite, err := h.actions.CreateInvite(c.Request.Context(), groupID, c.GetInt("user_id"), request.InviteeUserID, request.MaxUses)
	if errors.Is(err, services.ErrOmniChatSocialInvalidInput) {
		RespondError(c, http.StatusBadRequest, "Invalid invite request")
		return
	}
	if errors.Is(err, services.ErrNotFound) {
		RespondError(c, http.StatusForbidden, "Only group owners and admins can invite")
		return
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create invite")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"invite": invite, "token": token})
}

func (h *OmniChatGroupHandler) AcceptInvite(c *gin.Context) {
	var request struct {
		Token string `json:"token"`
	}
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid invite")
		return
	}
	group, err := h.actions.AcceptInvite(c.Request.Context(), strings.TrimSpace(request.Token), c.GetInt("user_id"))
	if errors.Is(err, services.ErrNotFound) {
		RespondError(c, http.StatusNotFound, "Invite is invalid or expired")
		return
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to join group")
		return
	}
	c.JSON(http.StatusOK, gin.H{"group": group})
}

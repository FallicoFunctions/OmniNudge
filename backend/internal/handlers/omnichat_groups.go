package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

type OmniChatGroupActions interface {
	SendMessage(ctx context.Context, groupID uuid.UUID, userID int, requestID uuid.UUID, content string, replyToID *uuid.UUID, responderPersonaIDs []int) ([]*models.OmniChatGroupMessage, bool, error)
	CreateInvite(ctx context.Context, groupID uuid.UUID, creatorUserID int, inviteeUserID *int, maxUses int) (string, *models.OmniChatGroupInvite, error)
	AcceptInvite(ctx context.Context, rawToken string, userID int) (*models.OmniChatGroup, error)
}

type OmniChatGroupData interface {
	CreateGroup(ctx context.Context, ownerUserID int, name, description string, personaIDs []int) (*models.OmniChatGroup, error)
	GetGroupForMember(ctx context.Context, groupID uuid.UUID, userID int) (*models.OmniChatGroup, error)
	ListGroupsForUser(ctx context.Context, userID int, before *models.OmniChatGroupCursor, limit int) ([]*models.OmniChatGroup, error)
	ListMessagesForMember(ctx context.Context, groupID uuid.UUID, userID int, before *models.OmniChatGroupMessageCursor, limit int) ([]*models.OmniChatGroupMessage, error)
	ListGroupPersonas(ctx context.Context, groupID uuid.UUID) ([]*models.OmniChatGroupPersona, error)
	UpdateGroup(ctx context.Context, groupID uuid.UUID, userID int, name, description, visibility string) (*models.OmniChatGroup, error)
	LeaveGroup(ctx context.Context, groupID uuid.UUID, userID int) (bool, error)
	SetMemberRole(ctx context.Context, groupID uuid.UUID, ownerUserID, targetUserID int, role string) (bool, error)
	RemoveMember(ctx context.Context, groupID uuid.UUID, actorUserID, targetUserID int) (bool, error)
	TransferOwnership(ctx context.Context, groupID uuid.UUID, ownerUserID, targetUserID int) (bool, error)
	ListInvites(ctx context.Context, groupID uuid.UUID, userID int) ([]*models.OmniChatGroupInvite, error)
	RevokeInvite(ctx context.Context, groupID, inviteID uuid.UUID, userID int) (bool, error)
	ArchiveGroup(ctx context.Context, groupID uuid.UUID, ownerUserID int) (bool, error)
	DeleteGroup(ctx context.Context, groupID uuid.UUID, ownerUserID int) (bool, error)
}

type OmniChatGroupHandler struct {
	actions   OmniChatGroupActions
	data      OmniChatGroupData
	allowance *services.OmniChatAllowance
}

func NewOmniChatGroupHandler(actions OmniChatGroupActions, data OmniChatGroupData, allowances ...*services.OmniChatAllowance) *OmniChatGroupHandler {
	var allowance *services.OmniChatAllowance
	if len(allowances) > 0 {
		allowance = allowances[0]
	}
	return &OmniChatGroupHandler{actions: actions, data: data, allowance: allowance}
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
		RequestID           uuid.UUID  `json:"idempotency_key"`
	}
	if err := decodeStrictJSON(c, &request); err != nil || request.RequestID == uuid.Nil {
		RespondError(c, http.StatusBadRequest, "Invalid group message")
		return
	}
	if len(request.ResponderPersonaIDs) > 3 {
		RespondError(c, http.StatusBadRequest, "Invalid group message")
		return
	}
	if len(request.ResponderPersonaIDs) == 0 {
		personas, err := h.data.ListGroupPersonas(c.Request.Context(), groupID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to resolve group characters")
			return
		}
		lowerContent := strings.ToLower(request.Content)
		for _, persona := range personas {
			name := strings.ToLower(persona.Name)
			if strings.Contains(lowerContent, name) || strings.Contains(lowerContent, "@"+strings.ReplaceAll(name, " ", "")) {
				request.ResponderPersonaIDs = append(request.ResponderPersonaIDs, persona.PersonaID)
				if len(request.ResponderPersonaIDs) == 3 {
					break
				}
			}
		}
	}
	var lease *services.OmniChatAllowanceLease
	if len(request.ResponderPersonaIDs) > 0 {
		var ok bool
		lease, ok = reserveOmniChatAllowance(c, h.allowance, len(request.ResponderPersonaIDs))
		if !ok {
			return
		}
	}
	successfulReplies := 0
	defer commitOmniChatAllowance(h.allowance, lease, &successfulReplies)
	messages, created, err := h.actions.SendMessage(c.Request.Context(), groupID, c.GetInt("user_id"), request.RequestID, request.Content, request.ReplyToID, request.ResponderPersonaIDs)
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
	if created {
		for _, message := range messages {
			if message.SenderPersonaID != nil && !message.Failed {
				successfulReplies++
			}
		}
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

func (h *OmniChatGroupHandler) UpdateGroup(c *gin.Context) {
	groupID, ok := parseUUIDParam(c, "group_id")
	if !ok {
		return
	}
	var request struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Visibility  string `json:"visibility"`
	}
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid group request")
		return
	}
	request.Name = strings.Join(strings.Fields(request.Name), " ")
	request.Description = strings.TrimSpace(request.Description)
	if request.Name == "" || utf8.RuneCountInString(request.Name) > 100 ||
		utf8.RuneCountInString(request.Description) > 1000 ||
		(request.Visibility != "private" && request.Visibility != "invite" && request.Visibility != "public") {
		RespondError(c, http.StatusBadRequest, "Invalid group request")
		return
	}
	group, err := h.data.UpdateGroup(c.Request.Context(), groupID, c.GetInt("user_id"), request.Name, request.Description, request.Visibility)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update group")
		return
	}
	if group == nil {
		RespondError(c, http.StatusNotFound, "Group not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"group": group})
}

func (h *OmniChatGroupHandler) LeaveGroup(c *gin.Context) {
	h.respondGroupBooleanAction(c, "leave", func(groupID uuid.UUID, userID int) (bool, error) {
		return h.data.LeaveGroup(c.Request.Context(), groupID, userID)
	})
}

func (h *OmniChatGroupHandler) SetMemberRole(c *gin.Context) {
	groupID, targetUserID, ok := parseGroupAndMember(c)
	if !ok {
		return
	}
	var request struct {
		Role string `json:"role"`
	}
	if err := decodeStrictJSON(c, &request); err != nil || (request.Role != "admin" && request.Role != "member") {
		RespondError(c, http.StatusBadRequest, "Invalid member role")
		return
	}
	updated, err := h.data.SetMemberRole(c.Request.Context(), groupID, c.GetInt("user_id"), targetUserID, request.Role)
	h.respondGroupMutation(c, updated, err, "Failed to update member role")
}

func (h *OmniChatGroupHandler) RemoveMember(c *gin.Context) {
	groupID, targetUserID, ok := parseGroupAndMember(c)
	if !ok {
		return
	}
	removed, err := h.data.RemoveMember(c.Request.Context(), groupID, c.GetInt("user_id"), targetUserID)
	h.respondGroupMutation(c, removed, err, "Failed to remove member")
}

func (h *OmniChatGroupHandler) TransferOwnership(c *gin.Context) {
	groupID, targetUserID, ok := parseGroupAndMember(c)
	if !ok {
		return
	}
	transferred, err := h.data.TransferOwnership(c.Request.Context(), groupID, c.GetInt("user_id"), targetUserID)
	h.respondGroupMutation(c, transferred, err, "Failed to transfer ownership")
}

func (h *OmniChatGroupHandler) ListInvites(c *gin.Context) {
	groupID, ok := parseUUIDParam(c, "group_id")
	if !ok {
		return
	}
	invites, err := h.data.ListInvites(c.Request.Context(), groupID, c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load invites")
		return
	}
	if invites == nil {
		invites = []*models.OmniChatGroupInvite{}
	}
	c.JSON(http.StatusOK, gin.H{"invites": invites})
}

func (h *OmniChatGroupHandler) RevokeInvite(c *gin.Context) {
	groupID, ok := parseUUIDParam(c, "group_id")
	if !ok {
		return
	}
	inviteID, ok := parseUUIDParam(c, "invite_id")
	if !ok {
		return
	}
	revoked, err := h.data.RevokeInvite(c.Request.Context(), groupID, inviteID, c.GetInt("user_id"))
	h.respondGroupMutation(c, revoked, err, "Failed to revoke invite")
}

func (h *OmniChatGroupHandler) ArchiveGroup(c *gin.Context) {
	h.respondGroupBooleanAction(c, "archive", func(groupID uuid.UUID, userID int) (bool, error) {
		return h.data.ArchiveGroup(c.Request.Context(), groupID, userID)
	})
}

func (h *OmniChatGroupHandler) DeleteGroup(c *gin.Context) {
	h.respondGroupBooleanAction(c, "delete", func(groupID uuid.UUID, userID int) (bool, error) {
		return h.data.DeleteGroup(c.Request.Context(), groupID, userID)
	})
}

func (h *OmniChatGroupHandler) respondGroupBooleanAction(c *gin.Context, _ string, action func(uuid.UUID, int) (bool, error)) {
	groupID, ok := parseUUIDParam(c, "group_id")
	if !ok {
		return
	}
	changed, err := action(groupID, c.GetInt("user_id"))
	h.respondGroupMutation(c, changed, err, "Failed to update group")
}

func (h *OmniChatGroupHandler) respondGroupMutation(c *gin.Context, changed bool, err error, message string) {
	if err != nil {
		RespondError(c, http.StatusInternalServerError, message)
		return
	}
	if !changed {
		RespondError(c, http.StatusNotFound, "Group or member not found")
		return
	}
	c.Status(http.StatusNoContent)
}

func parseGroupAndMember(c *gin.Context) (uuid.UUID, int, bool) {
	groupID, ok := parseUUIDParam(c, "group_id")
	if !ok {
		return uuid.Nil, 0, false
	}
	targetUserID, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || targetUserID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return uuid.Nil, 0, false
	}
	return groupID, targetUserID, true
}

package handlers

import (
	"github.com/omninudge/backend/internal/api/middleware"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GroupHandler handles group conversation HTTP endpoints.
type GroupHandler struct {
	pool *pgxpool.Pool
}

// NewGroupHandler creates a new GroupHandler.
func NewGroupHandler(pool *pgxpool.Pool) *GroupHandler {
	return &GroupHandler{pool: pool}
}

// ─── Request / Response Types ─────────────────────────────────────────────────

type CreateGroupRequest struct {
	Name           string              `json:"name"          binding:"required"`
	ParticipantIDs []int               `json:"participant_ids" binding:"required"`
	AvatarURL      string              `json:"avatar_url"`
	Description    string              `json:"description"`
	Settings       *GroupSettingsInput `json:"settings"`
}

type GroupSettingsInput struct {
	AnyoneCanInvite       bool `json:"anyone_can_invite"`
	AnyoneCanPin          bool `json:"anyone_can_pin"`
	MessageHistoryVisible bool `json:"message_history_visible"`
}

type UpdateGroupRequest struct {
	Name        *string `json:"name"`
	AvatarURL   *string `json:"avatar_url"`
	Description *string `json:"description"`
}

type UpdateGroupSettingsRequest struct {
	AnyoneCanInvite       *bool `json:"anyone_can_invite"`
	AnyoneCanPin          *bool `json:"anyone_can_pin"`
	MessageHistoryVisible *bool `json:"message_history_visible"`
	SlowModeSeconds       *int  `json:"slow_mode_seconds"`
}

type AddParticipantRequest struct {
	UserID int `json:"user_id" binding:"required"`
}

type UpdateParticipantRoleRequest struct {
	Role string `json:"role" binding:"required"`
}

type TransferOwnershipRequest struct {
	NewOwnerUserID int `json:"new_owner_user_id" binding:"required"`
}

type CreateGroupInviteRequest struct {
	UserID int `json:"user_id" binding:"required"`
}

type GroupConversationResponse struct {
	ID               int       `json:"id"`
	ConversationType string    `json:"conversation_type"`
	IsGroup          bool      `json:"is_group"`
	GroupName        *string   `json:"group_name,omitempty"`
	GroupAvatarURL   *string   `json:"group_avatar_url,omitempty"`
	GroupDescription *string   `json:"group_description,omitempty"`
	CreatedBy        *int      `json:"created_by,omitempty"`
	MaxParticipants  int       `json:"max_participants"`
	IsPublic         bool      `json:"is_public"`
	CreatedAt        time.Time `json:"created_at"`
	LastMessageAt    time.Time `json:"last_message_at"`
	UnreadCount      int       `json:"unread_count"`
	ParticipantCount int       `json:"participant_count"`
	CurrentUserRole  string    `json:"current_user_role"`
}

type GroupParticipantResponse struct {
	UserID    int       `json:"user_id"`
	Username  string    `json:"username"`
	AvatarURL *string   `json:"avatar_url,omitempty"`
	Role      string    `json:"role"`
	JoinedAt  time.Time `json:"joined_at"`
	InvitedBy *int      `json:"invited_by,omitempty"`
}

type GroupSettingsResponse struct {
	AnyoneCanInvite       bool `json:"anyone_can_invite"`
	AnyoneCanPin          bool `json:"anyone_can_pin"`
	MessageHistoryVisible bool `json:"message_history_visible"`
	SlowModeSeconds       int  `json:"slow_mode_seconds"`
}

type GroupInviteResponse struct {
	ID                int       `json:"id"`
	ConversationID    int       `json:"conversation_id"`
	GroupName         *string   `json:"group_name,omitempty"`
	GroupAvatarURL    *string   `json:"group_avatar_url,omitempty"`
	InvitedByUsername *string   `json:"invited_by_username,omitempty"`
	Status            string    `json:"status"`
	ExpiresAt         time.Time `json:"expires_at"`
	CreatedAt         time.Time `json:"created_at"`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// getUserRoleInGroup returns the current user's role ('owner', 'admin', 'member')
// or an empty string if not a participant.
func (h *GroupHandler) getUserRoleInGroup(c *gin.Context, conversationID, userID int) (string, error) {
	var role string
	err := h.pool.QueryRow(c.Request.Context(), `
		SELECT role FROM conversation_participants
		WHERE conversation_id = $1 AND user_id = $2
	`, conversationID, userID).Scan(&role)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	return role, err
}

// ensureGroupParticipant returns 403 if user is not a group participant.
func (h *GroupHandler) ensureGroupParticipant(c *gin.Context, conversationID, userID int) (string, bool) {
	role, err := h.getUserRoleInGroup(c, conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check membership")
		return "", false
	}
	if role == "" {
		RespondError(c, http.StatusForbidden, "Not a member of this group")
		return "", false
	}
	return role, true
}

// ensureGroupExists validates that the conversation exists and is a group.
// Returns (conversationID, ok).
func (h *GroupHandler) ensureGroupExists(c *gin.Context) (int, bool) {
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return 0, false
	}
	var isGroup bool
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT is_group FROM conversations WHERE id = $1
	`, conversationID).Scan(&isGroup)
	if err == pgx.ErrNoRows {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return 0, false
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch conversation")
		return 0, false
	}
	if !isGroup {
		RespondError(c, http.StatusBadRequest, "This is not a group conversation")
		return 0, false
	}
	return conversationID, true
}

func (h *GroupHandler) hasBlockingRelationship(ctx *gin.Context, userA, userB int) (bool, error) {
	var blocked bool
	err := h.pool.QueryRow(ctx.Request.Context(), `
		SELECT EXISTS (
			SELECT 1
			FROM blocked_users
			WHERE (blocker_id = $1 AND blocked_id = $2)
			   OR (blocker_id = $2 AND blocked_id = $1)
		)
	`, userA, userB).Scan(&blocked)
	return blocked, err
}

func (h *GroupHandler) hasBlockingWithinUsers(ctx *gin.Context, userIDs []int) (bool, error) {
	if len(userIDs) < 2 {
		return false, nil
	}

	var blocked bool
	err := h.pool.QueryRow(ctx.Request.Context(), `
		WITH participant_ids AS (
			SELECT UNNEST($1::int[]) AS user_id
		)
		SELECT EXISTS (
			SELECT 1
			FROM blocked_users bu
			JOIN participant_ids p1 ON p1.user_id = bu.blocker_id
			JOIN participant_ids p2 ON p2.user_id = bu.blocked_id
		)
	`, userIDs).Scan(&blocked)
	return blocked, err
}

func (h *GroupHandler) getGroupParticipantIDs(ctx *gin.Context, conversationID int) ([]int, error) {
	rows, err := h.pool.Query(ctx.Request.Context(), `
		SELECT user_id
		FROM conversation_participants
		WHERE conversation_id = $1
	`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	participants := make([]int, 0, 16)
	for rows.Next() {
		var userID int
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		participants = append(participants, userID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return participants, nil
}

// ─── CreateGroup ──────────────────────────────────────────────────────────────

// CreateGroup handles POST /api/v1/conversations/groups
func (h *GroupHandler) CreateGroup(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req CreateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	if len(req.Name) == 0 || len(req.Name) > 100 {
		RespondError(c, http.StatusBadRequest, "Group name must be 1–100 characters")
		return
	}
	// De-duplicate and exclude creator from participant list
	seen := map[int]bool{userID: true}
	unique := make([]int, 0, len(req.ParticipantIDs))
	for _, id := range req.ParticipantIDs {
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}
	// Total participants = creator + unique others; minimum 2 others → 3 total
	if len(unique) < 2 {
		RespondError(c, http.StatusBadRequest, "A group needs at least 2 other participants (3 total)")
		return
	}
	if len(unique) > 249 {
		RespondError(c, http.StatusBadRequest, "Maximum 250 participants per group")
		return
	}
	participants := make([]int, 0, len(unique)+1)
	participants = append(participants, userID)
	participants = append(participants, unique...)

	blocked, err := h.hasBlockingWithinUsers(c, participants)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
		return
	}
	if blocked {
		RespondError(c, http.StatusForbidden, blockingSettingsErrorMessage)
		return
	}

	ctx := c.Request.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// Create conversation
	var conversationID int
	var createdAt, lastMessageAt time.Time
	avatarURL := req.AvatarURL
	description := req.Description

	err = tx.QueryRow(ctx, `
		INSERT INTO conversations
			(conversation_type, is_group, group_name, group_avatar_url, group_description, created_by, max_participants, last_message_at)
		VALUES
			('group', TRUE, $1, NULLIF($2, ''), NULLIF($3, ''), $4, 250, CURRENT_TIMESTAMP)
		RETURNING id, created_at, last_message_at
	`, req.Name, avatarURL, description, userID).Scan(&conversationID, &createdAt, &lastMessageAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create group", "details": err.Error()})
		return
	}

	// Add creator as owner
	_, err = tx.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
		VALUES ($1, $2, 'owner', CURRENT_TIMESTAMP)
	`, conversationID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add creator", "details": err.Error()})
		return
	}

	// Add participants
	for _, participantID := range unique {
		_, err = tx.Exec(ctx, `
			INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at, invited_by)
			VALUES ($1, $2, 'member', CURRENT_TIMESTAMP, $3)
			ON CONFLICT (conversation_id, user_id) DO NOTHING
		`, conversationID, participantID, userID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, fmt.Sprintf("Failed to add participant %d", participantID))
			return
		}
	}

	// Create group settings
	anyoneCanInvite, anyoneCanPin, historyVisible := false, false, true
	if req.Settings != nil {
		anyoneCanInvite = req.Settings.AnyoneCanInvite
		anyoneCanPin = req.Settings.AnyoneCanPin
		historyVisible = req.Settings.MessageHistoryVisible
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO group_settings (conversation_id, anyone_can_invite, anyone_can_pin, message_history_visible)
		VALUES ($1, $2, $3, $4)
	`, conversationID, anyoneCanInvite, anyoneCanPin, historyVisible)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create group settings")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to commit transaction")
		return
	}

	name := req.Name
	var avatarPtr *string
	if avatarURL != "" {
		avatarPtr = &avatarURL
	}
	var descPtr *string
	if description != "" {
		descPtr = &description
	}

	c.JSON(http.StatusCreated, GroupConversationResponse{
		ID:               conversationID,
		ConversationType: "group",
		IsGroup:          true,
		GroupName:        &name,
		GroupAvatarURL:   avatarPtr,
		GroupDescription: descPtr,
		CreatedBy:        &userID,
		MaxParticipants:  250,
		CreatedAt:        createdAt,
		LastMessageAt:    lastMessageAt,
		ParticipantCount: len(unique) + 1,
		CurrentUserRole:  "owner",
	})
}

// ─── GetGroupParticipants ─────────────────────────────────────────────────────

// GetGroupParticipants handles GET /api/v1/conversations/:id/participants
func (h *GroupHandler) GetGroupParticipants(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, ok := h.ensureGroupExists(c)
	if !ok {
		return
	}
	if _, ok := h.ensureGroupParticipant(c, conversationID, userID); !ok {
		return
	}

	rows, err := h.pool.Query(c.Request.Context(), `
		SELECT cp.user_id, u.username, u.avatar_url, cp.role, cp.joined_at, cp.invited_by
		FROM conversation_participants cp
		JOIN users u ON u.id = cp.user_id
		WHERE cp.conversation_id = $1
		ORDER BY
			CASE cp.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
			cp.joined_at ASC
	`, conversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch participants")
		return
	}
	defer rows.Close()

	participants := make([]GroupParticipantResponse, 0)
	for rows.Next() {
		var p GroupParticipantResponse
		if err := rows.Scan(&p.UserID, &p.Username, &p.AvatarURL, &p.Role, &p.JoinedAt, &p.InvitedBy); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to scan participant")
			return
		}
		participants = append(participants, p)
	}
	if err := rows.Err(); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to read participants")
		return
	}

	c.JSON(http.StatusOK, gin.H{"participants": participants})
}

// ─── AddGroupParticipant ──────────────────────────────────────────────────────

// AddGroupParticipant handles POST /api/v1/conversations/:id/participants
func (h *GroupHandler) AddGroupParticipant(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, ok := h.ensureGroupExists(c)
	if !ok {
		return
	}
	role, ok := h.ensureGroupParticipant(c, conversationID, userID)
	if !ok {
		return
	}

	var req AddParticipantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	ctx := c.Request.Context()

	// Check permission: admin/owner or anyone_can_invite setting
	if role == "member" {
		var anyoneCanInvite bool
		h.pool.QueryRow(ctx, `
			SELECT COALESCE(anyone_can_invite, false) FROM group_settings WHERE conversation_id = $1
		`, conversationID).Scan(&anyoneCanInvite)
		if !anyoneCanInvite {
			RespondError(c, http.StatusForbidden, "Only admins can add participants")
			return
		}
	}

	// Check max participants
	var count int
	h.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = $1
	`, conversationID).Scan(&count)
	if count >= 250 {
		RespondError(c, http.StatusConflict, "Group is full (max 250 members)")
		return
	}

	// Check if already a member
	existingRole, err := h.getUserRoleInGroup(c, conversationID, req.UserID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check existing membership")
		return
	}
	if existingRole != "" {
		RespondError(c, http.StatusConflict, "User is already a member")
		return
	}
	participants, err := h.getGroupParticipantIDs(c, conversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
		return
	}
	participants = append(participants, req.UserID)
	blocked, err := h.hasBlockingWithinUsers(c, participants)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
		return
	}
	if blocked {
		RespondError(c, http.StatusForbidden, blockingSettingsErrorMessage)
		return
	}

	_, err = h.pool.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at, invited_by)
		VALUES ($1, $2, 'member', CURRENT_TIMESTAMP, $3)
	`, conversationID, req.UserID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to add participant")
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Participant added"})
}

// ─── RemoveGroupParticipant ───────────────────────────────────────────────────

// RemoveGroupParticipant handles DELETE /api/v1/conversations/:id/participants/:user_id
func (h *GroupHandler) RemoveGroupParticipant(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, ok := h.ensureGroupExists(c)
	if !ok {
		return
	}
	requesterRole, ok := h.ensureGroupParticipant(c, conversationID, userID)
	if !ok {
		return
	}

	targetID, err := strconv.Atoi(c.Param("user_id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return
	}

	// Can remove self, or admin/owner can remove members
	if targetID != userID {
		if requesterRole == "member" {
			RespondError(c, http.StatusForbidden, "Only admins can remove participants")
			return
		}
		targetRole, _ := h.getUserRoleInGroup(c, conversationID, targetID)
		if targetRole == "owner" {
			RespondError(c, http.StatusForbidden, "Cannot remove the group owner")
			return
		}
	}

	// If removing self as owner, block unless transferring
	if targetID == userID && requesterRole == "owner" {
		RespondError(c, http.StatusConflict, "Must transfer ownership before leaving")
		return
	}

	result, err := h.pool.Exec(c.Request.Context(), `
		DELETE FROM conversation_participants
		WHERE conversation_id = $1 AND user_id = $2
	`, conversationID, targetID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to remove participant")
		return
	}
	if result.RowsAffected() == 0 {
		RespondError(c, http.StatusNotFound, "Participant not found")
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

// ─── UpdateParticipantRole ────────────────────────────────────────────────────

// UpdateParticipantRole handles PATCH /api/v1/conversations/:id/participants/:user_id
func (h *GroupHandler) UpdateParticipantRole(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, ok := h.ensureGroupExists(c)
	if !ok {
		return
	}
	requesterRole, ok := h.ensureGroupParticipant(c, conversationID, userID)
	if !ok {
		return
	}
	if requesterRole != "owner" {
		RespondError(c, http.StatusForbidden, "Only the owner can change roles")
		return
	}

	targetID, err := strconv.Atoi(c.Param("user_id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return
	}
	if targetID == userID {
		RespondError(c, http.StatusBadRequest, "Cannot change your own role")
		return
	}

	var req UpdateParticipantRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if req.Role != "admin" && req.Role != "member" {
		RespondError(c, http.StatusBadRequest, "Role must be 'admin' or 'member'")
		return
	}

	result, err := h.pool.Exec(c.Request.Context(), `
		UPDATE conversation_participants
		SET role = $3
		WHERE conversation_id = $1 AND user_id = $2
	`, conversationID, targetID, req.Role)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update role")
		return
	}
	if result.RowsAffected() == 0 {
		RespondError(c, http.StatusNotFound, "Participant not found")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Role updated"})
}

// ─── UpdateGroup ──────────────────────────────────────────────────────────────

// UpdateGroup handles PATCH /api/v1/conversations/:id/group
func (h *GroupHandler) UpdateGroup(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, ok := h.ensureGroupExists(c)
	if !ok {
		return
	}
	role, ok := h.ensureGroupParticipant(c, conversationID, userID)
	if !ok {
		return
	}
	if role == "member" {
		RespondError(c, http.StatusForbidden, "Only admins can update group info")
		return
	}

	var req UpdateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	ctx := c.Request.Context()
	var conv GroupConversationResponse
	err := h.pool.QueryRow(ctx, `
		UPDATE conversations
		SET
			group_name        = COALESCE($2, group_name),
			group_avatar_url  = CASE WHEN $3::text IS NOT NULL THEN NULLIF($3, '') ELSE group_avatar_url END,
			group_description = CASE WHEN $4::text IS NOT NULL THEN NULLIF($4, '') ELSE group_description END
		WHERE id = $1
		RETURNING id, conversation_type, is_group, group_name, group_avatar_url, group_description, created_by, max_participants, is_public, created_at, last_message_at
	`, conversationID, req.Name, req.AvatarURL, req.Description).Scan(
		&conv.ID, &conv.ConversationType, &conv.IsGroup, &conv.GroupName, &conv.GroupAvatarURL,
		&conv.GroupDescription, &conv.CreatedBy, &conv.MaxParticipants, &conv.IsPublic,
		&conv.CreatedAt, &conv.LastMessageAt,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update group", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, conv)
}

// ─── GetGroupSettings ─────────────────────────────────────────────────────────

// GetGroupSettings handles GET /api/v1/conversations/:id/settings
func (h *GroupHandler) GetGroupSettings(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, ok := h.ensureGroupExists(c)
	if !ok {
		return
	}
	if _, ok := h.ensureGroupParticipant(c, conversationID, userID); !ok {
		return
	}

	var s GroupSettingsResponse
	err := h.pool.QueryRow(c.Request.Context(), `
		SELECT anyone_can_invite, anyone_can_pin, message_history_visible, slow_mode_seconds
		FROM group_settings
		WHERE conversation_id = $1
	`, conversationID).Scan(&s.AnyoneCanInvite, &s.AnyoneCanPin, &s.MessageHistoryVisible, &s.SlowModeSeconds)
	if err == pgx.ErrNoRows {
		// Return defaults if settings row not found
		s = GroupSettingsResponse{MessageHistoryVisible: true}
	} else if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch settings")
		return
	}

	c.JSON(http.StatusOK, s)
}

// ─── UpdateGroupSettings ──────────────────────────────────────────────────────

// UpdateGroupSettings handles PATCH /api/v1/conversations/:id/settings
func (h *GroupHandler) UpdateGroupSettings(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, ok := h.ensureGroupExists(c)
	if !ok {
		return
	}
	role, ok := h.ensureGroupParticipant(c, conversationID, userID)
	if !ok {
		return
	}
	if role == "member" {
		RespondError(c, http.StatusForbidden, "Only admins can update settings")
		return
	}

	var req UpdateGroupSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	var s GroupSettingsResponse
	err := h.pool.QueryRow(c.Request.Context(), `
		INSERT INTO group_settings (conversation_id, anyone_can_invite, anyone_can_pin, message_history_visible, slow_mode_seconds)
		VALUES ($1, COALESCE($2, FALSE), COALESCE($3, FALSE), COALESCE($4, TRUE), COALESCE($5, 0))
		ON CONFLICT (conversation_id) DO UPDATE SET
			anyone_can_invite       = COALESCE($2, group_settings.anyone_can_invite),
			anyone_can_pin          = COALESCE($3, group_settings.anyone_can_pin),
			message_history_visible = COALESCE($4, group_settings.message_history_visible),
			slow_mode_seconds       = COALESCE($5, group_settings.slow_mode_seconds),
			updated_at              = CURRENT_TIMESTAMP
		RETURNING anyone_can_invite, anyone_can_pin, message_history_visible, slow_mode_seconds
	`, conversationID, req.AnyoneCanInvite, req.AnyoneCanPin, req.MessageHistoryVisible, req.SlowModeSeconds).
		Scan(&s.AnyoneCanInvite, &s.AnyoneCanPin, &s.MessageHistoryVisible, &s.SlowModeSeconds)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update settings", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, s)
}

// ─── CreateGroupInvite ────────────────────────────────────────────────────────

// CreateGroupInvite handles POST /api/v1/conversations/:id/invites
func (h *GroupHandler) CreateGroupInvite(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, ok := h.ensureGroupExists(c)
	if !ok {
		return
	}
	role, ok := h.ensureGroupParticipant(c, conversationID, userID)
	if !ok {
		return
	}

	// Permission check
	if role == "member" {
		var anyoneCanInvite bool
		h.pool.QueryRow(c.Request.Context(), `
			SELECT COALESCE(anyone_can_invite, false) FROM group_settings WHERE conversation_id = $1
		`, conversationID).Scan(&anyoneCanInvite)
		if !anyoneCanInvite {
			RespondError(c, http.StatusForbidden, "Only admins can send invites")
			return
		}
	}

	var req CreateGroupInviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	// Check target not already a member
	existingRole, _ := h.getUserRoleInGroup(c, conversationID, req.UserID)
	if existingRole != "" {
		RespondError(c, http.StatusConflict, "User is already a member")
		return
	}
	participants, err := h.getGroupParticipantIDs(c, conversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
		return
	}
	participants = append(participants, req.UserID)
	blocked, err := h.hasBlockingWithinUsers(c, participants)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
		return
	}
	if blocked {
		RespondError(c, http.StatusForbidden, blockingSettingsErrorMessage)
		return
	}

	var invite GroupInviteResponse
	err = h.pool.QueryRow(c.Request.Context(), `
		INSERT INTO group_invites (conversation_id, invited_user_id, invited_by, status, expires_at)
		VALUES ($1, $2, $3, 'pending', CURRENT_TIMESTAMP + INTERVAL '7 days')
		ON CONFLICT (conversation_id, invited_user_id) DO UPDATE
		SET status = 'pending', expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days', updated_at = CURRENT_TIMESTAMP
		RETURNING id, conversation_id, status, expires_at, created_at
	`, conversationID, req.UserID, userID).
		Scan(&invite.ID, &invite.ConversationID, &invite.Status, &invite.ExpiresAt, &invite.CreatedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create invite", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, invite)
}

// ─── AcceptGroupInvite ────────────────────────────────────────────────────────

// AcceptGroupInvite handles POST /api/v1/group-invites/:id/accept
func (h *GroupHandler) AcceptGroupInvite(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	inviteID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid invite ID")
		return
	}

	ctx := c.Request.Context()
	var conversationID int
	var invitedBy int
	var status string
	var expiresAt time.Time
	err = h.pool.QueryRow(ctx, `
		SELECT conversation_id, invited_by, status, expires_at
		FROM group_invites
		WHERE id = $1 AND invited_user_id = $2
	`, inviteID, userID).Scan(&conversationID, &invitedBy, &status, &expiresAt)
	if err == pgx.ErrNoRows {
		RespondError(c, http.StatusNotFound, "Invite not found")
		return
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch invite")
		return
	}
	if status != "pending" {
		RespondError(c, http.StatusConflict, "Invite is no longer pending")
		return
	}
	if expiresAt.Before(time.Now()) {
		RespondError(c, http.StatusGone, "Invite has expired")
		return
	}
	blocked, err := h.hasBlockingRelationship(c, userID, invitedBy)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
		return
	}
	if blocked {
		RespondError(c, http.StatusForbidden, blockingSettingsErrorMessage)
		return
	}
	participants, err := h.getGroupParticipantIDs(c, conversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
		return
	}
	participants = append(participants, userID)
	blocked, err = h.hasBlockingWithinUsers(c, participants)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
		return
	}
	if blocked {
		RespondError(c, http.StatusForbidden, blockingSettingsErrorMessage)
		return
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
		VALUES ($1, $2, 'member', CURRENT_TIMESTAMP)
		ON CONFLICT (conversation_id, user_id) DO NOTHING
	`, conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to join group")
		return
	}

	_, err = tx.Exec(ctx, `
		UPDATE group_invites SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, inviteID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update invite")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to commit")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Joined group"})
}

// ─── DeclineGroupInvite ───────────────────────────────────────────────────────

// DeclineGroupInvite handles DELETE /api/v1/group-invites/:id/decline
func (h *GroupHandler) DeclineGroupInvite(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	inviteID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid invite ID")
		return
	}

	result, err := h.pool.Exec(c.Request.Context(), `
		UPDATE group_invites
		SET status = 'declined', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND invited_user_id = $2 AND status = 'pending'
	`, inviteID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to decline invite")
		return
	}
	if result.RowsAffected() == 0 {
		RespondError(c, http.StatusNotFound, "Invite not found or already processed")
		return
	}

	c.Status(http.StatusNoContent)
}

// ─── GetMyGroupInvites ────────────────────────────────────────────────────────

// GetMyGroupInvites handles GET /api/v1/users/me/group-invites
func (h *GroupHandler) GetMyGroupInvites(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	rows, err := h.pool.Query(c.Request.Context(), `
		SELECT gi.id, gi.conversation_id, c.group_name, c.group_avatar_url,
		       u.username AS invited_by_username,
		       gi.status, gi.expires_at, gi.created_at
		FROM group_invites gi
		JOIN conversations c ON c.id = gi.conversation_id
		JOIN users u ON u.id = gi.invited_by
		WHERE gi.invited_user_id = $1
		  AND gi.status = 'pending'
		  AND gi.expires_at > CURRENT_TIMESTAMP
		ORDER BY gi.created_at DESC
		LIMIT 50
	`, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch invites")
		return
	}
	defer rows.Close()

	invites := make([]GroupInviteResponse, 0)
	for rows.Next() {
		var inv GroupInviteResponse
		var invitedByUsername string
		if err := rows.Scan(
			&inv.ID, &inv.ConversationID, &inv.GroupName, &inv.GroupAvatarURL,
			&invitedByUsername, &inv.Status, &inv.ExpiresAt, &inv.CreatedAt,
		); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to scan invite")
			return
		}
		inv.InvitedByUsername = &invitedByUsername
		invites = append(invites, inv)
	}

	c.JSON(http.StatusOK, gin.H{"invites": invites})
}

// ─── LeaveGroup ───────────────────────────────────────────────────────────────

// LeaveGroup handles POST /api/v1/conversations/:id/leave
func (h *GroupHandler) LeaveGroup(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, ok := h.ensureGroupExists(c)
	if !ok {
		return
	}
	role, ok := h.ensureGroupParticipant(c, conversationID, userID)
	if !ok {
		return
	}

	if role == "owner" {
		RespondError(c, http.StatusConflict, "Must transfer ownership before leaving")
		return
	}

	_, err := h.pool.Exec(c.Request.Context(), `
		DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2
	`, conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to leave group")
		return
	}

	c.Status(http.StatusNoContent)
}

// ─── TransferOwnership ────────────────────────────────────────────────────────

// TransferOwnership handles POST /api/v1/conversations/:id/transfer-ownership
func (h *GroupHandler) TransferOwnership(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, ok := h.ensureGroupExists(c)
	if !ok {
		return
	}
	role, ok := h.ensureGroupParticipant(c, conversationID, userID)
	if !ok {
		return
	}
	if role != "owner" {
		RespondError(c, http.StatusForbidden, "Only the owner can transfer ownership")
		return
	}

	var req TransferOwnershipRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if req.NewOwnerUserID == userID {
		RespondError(c, http.StatusBadRequest, "Cannot transfer ownership to yourself")
		return
	}

	// Verify new owner is a member
	newOwnerRole, err := h.getUserRoleInGroup(c, conversationID, req.NewOwnerUserID)
	if err != nil || newOwnerRole == "" {
		RespondError(c, http.StatusBadRequest, "New owner must be a current member")
		return
	}

	ctx := c.Request.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// Demote current owner to admin
	_, err = tx.Exec(ctx, `
		UPDATE conversation_participants SET role = 'admin' WHERE conversation_id = $1 AND user_id = $2
	`, conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update old owner")
		return
	}

	// Promote new owner
	_, err = tx.Exec(ctx, `
		UPDATE conversation_participants SET role = 'owner' WHERE conversation_id = $1 AND user_id = $2
	`, conversationID, req.NewOwnerUserID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update new owner")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to commit")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Ownership transferred"})
}

// ─── DiscoverGroups ───────────────────────────────────────────────────────────

// DiscoverGroups handles GET /api/v1/groups/discover
func (h *GroupHandler) DiscoverGroups(c *gin.Context) {
	query := c.Query("q")
	limit := 20
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 50 {
		limit = l
	}

	var rows interface{ Close() }
	var err error

	if query != "" {
		pattern := "%" + query + "%"
		rows, err = h.pool.Query(c.Request.Context(), `
			SELECT id, group_name, group_avatar_url, group_description, is_verified,
			       (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = conversations.id) AS participant_count,
			       last_message_at
			FROM conversations
			WHERE is_group = TRUE AND is_public = TRUE AND is_discoverable = TRUE
			  AND (group_name ILIKE $1 OR group_description ILIKE $1)
			ORDER BY is_verified DESC, participant_count DESC, last_message_at DESC
			LIMIT $2
		`, pattern, limit)
	} else {
		rows, err = h.pool.Query(c.Request.Context(), `
			SELECT id, group_name, group_avatar_url, group_description, is_verified,
			       (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = conversations.id) AS participant_count,
			       last_message_at
			FROM conversations
			WHERE is_group = TRUE AND is_public = TRUE AND is_discoverable = TRUE
			ORDER BY is_verified DESC, participant_count DESC, last_message_at DESC
			LIMIT $1
		`, limit)
	}

	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch groups")
		return
	}

	// We need the concrete type for iteration; use type assertion
	type discoverRow struct {
		ID               int
		GroupName        *string
		GroupAvatarURL   *string
		GroupDescription *string
		IsVerified       bool
		ParticipantCount int
		LastMessageAt    time.Time
	}

	type pgxRows interface {
		Next() bool
		Scan(dest ...any) error
		Err() error
		Close()
	}

	pgRows := rows.(pgxRows)
	defer pgRows.Close()

	groups := make([]gin.H, 0)
	for pgRows.Next() {
		var r discoverRow
		if err := pgRows.Scan(&r.ID, &r.GroupName, &r.GroupAvatarURL, &r.GroupDescription, &r.IsVerified, &r.ParticipantCount, &r.LastMessageAt); err != nil {
			continue
		}
		groups = append(groups, gin.H{
			"id":                r.ID,
			"group_name":        r.GroupName,
			"group_avatar_url":  r.GroupAvatarURL,
			"group_description": r.GroupDescription,
			"is_verified":       r.IsVerified,
			"participant_count": r.ParticipantCount,
			"last_message_at":   r.LastMessageAt,
			"conversation_type": "group",
			"is_group":          true,
		})
	}

	c.JSON(http.StatusOK, gin.H{"groups": groups})
}

package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/websocket"
)

// GroupAdminHandler handles admin controls for group conversations.
type GroupAdminHandler struct {
	pool  *pgxpool.Pool
	hub   HubInterface
	cache services.Cache
}

// NewGroupAdminHandler creates a new GroupAdminHandler.
func NewGroupAdminHandler(pool *pgxpool.Pool, hub HubInterface, cache services.Cache) *GroupAdminHandler {
	return &GroupAdminHandler{pool: pool, hub: hub, cache: cache}
}

// requireGroupAdmin verifies the calling user is an admin or owner of the given conversation.
// Returns the role ("admin" or "owner") or an error.
func requireGroupAdmin(ctx context.Context, pool *pgxpool.Pool, convID, userID int) (string, error) {
	var role string
	err := pool.QueryRow(ctx, `
		SELECT role FROM conversation_participants
		WHERE conversation_id = $1 AND user_id = $2 AND role IN ('owner','admin')
	`, convID, userID).Scan(&role)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", fmt.Errorf("not an admin")
		}
		return "", fmt.Errorf("requireGroupAdmin: %w", err)
	}
	return role, nil
}

// logAuditAction inserts a record into group_audit_log.
func logAuditAction(ctx context.Context, pool *pgxpool.Pool, convID, adminID int, actionType string, targetUserID *int, details map[string]any) {
	var detailsJSON []byte
	if details != nil {
		var err error
		detailsJSON, err = json.Marshal(details)
		if err != nil {
			log.Printf("[GroupAdmin] failed to marshal audit details: %v", err)
		}
	}
	_, err := pool.Exec(ctx, `
		INSERT INTO group_audit_log (conversation_id, admin_id, action_type, target_user_id, details)
		VALUES ($1, $2, $3, $4, $5)
	`, convID, adminID, actionType, targetUserID, detailsJSON)
	if err != nil {
		log.Printf("[GroupAdmin] failed to log audit action: conversation_id=%d admin_id=%d action=%s err=%v", convID, adminID, actionType, err)
	}
}

// broadcastToGroup sends a WebSocket event to all participants in a group.
func broadcastToGroup(ctx context.Context, pool *pgxpool.Pool, hub HubInterface, convID int, msgType string, payload any) {
	rows, err := pool.Query(ctx, `SELECT user_id FROM conversation_participants WHERE conversation_id = $1`, convID)
	if err != nil {
		log.Printf("[GroupAdmin] broadcastToGroup: failed to query participants: conversation_id=%d err=%v", convID, err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var uid int
		if err := rows.Scan(&uid); err != nil {
			continue
		}
		hub.Broadcast(&websocket.Message{
			RecipientID: uid,
			Type:        msgType,
			Payload:     payload,
		})
	}
}

// ─── Request / Response Types ─────────────────────────────────────────────────

type MuteGroupMemberRequest struct {
	DurationMinutes int    `json:"duration_minutes"`
	Reason          string `json:"reason"`
}

type BanGroupMemberRequest struct {
	Reason         string `json:"reason"`
	DeleteMessages bool   `json:"delete_messages"`
}

type SetSlowModeRequest struct {
	Seconds int `json:"seconds"`
}

type GroupRestrictionRow struct {
	ID                   int        `json:"id"`
	ConversationID       int        `json:"conversation_id"`
	UserID               int        `json:"user_id"`
	TargetUsername       string     `json:"target_username"`
	RestrictedBy         int        `json:"restricted_by"`
	RestrictedByUsername string     `json:"restricted_by_username"`
	RestrictionType      string     `json:"restriction_type"`
	Reason               *string    `json:"reason"`
	ExpiresAt            *time.Time `json:"expires_at"`
	CreatedAt            time.Time  `json:"created_at"`
}

type AuditLogRow struct {
	ID             int            `json:"id"`
	ConversationID int            `json:"conversation_id"`
	AdminID        int            `json:"admin_id"`
	AdminUsername  string         `json:"admin_username"`
	ActionType     string         `json:"action_type"`
	TargetUserID   *int           `json:"target_user_id"`
	TargetUsername *string        `json:"target_username"`
	Details        map[string]any `json:"details"`
	CreatedAt      time.Time      `json:"created_at"`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func parseGroupID(c *gin.Context) (int, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return 0, false
	}
	return id, true
}

func parseTargetUserID(c *gin.Context) (int, bool) {
	id, err := strconv.Atoi(c.Param("user_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return 0, false
	}
	return id, true
}

func getCallerID(c *gin.Context) (int, bool) {
	val, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return 0, false
	}
	return val.(int), true
}

// isGroupOwner returns true when targetUserID holds the 'owner' role in the conversation.
func isGroupOwner(ctx context.Context, pool *pgxpool.Pool, convID, targetUserID int) (bool, error) {
	var role string
	err := pool.QueryRow(ctx, `SELECT role FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2`, convID, targetUserID).Scan(&role)
	if err != nil {
		if err == pgx.ErrNoRows {
			return false, nil
		}
		return false, fmt.Errorf("isGroupOwner: %w", err)
	}
	return role == "owner", nil
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

// MuteGroupMember POST /groups/:id/members/:user_id/mute
func (h *GroupAdminHandler) MuteGroupMember(c *gin.Context) {
	convID, ok := parseGroupID(c)
	if !ok {
		return
	}
	targetUserID, ok := parseTargetUserID(c)
	if !ok {
		return
	}
	callerID, ok := getCallerID(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	if _, err := requireGroupAdmin(ctx, h.pool, convID, callerID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group admins can perform this action"})
		return
	}

	owner, err := isGroupOwner(ctx, h.pool, convID, targetUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check target role"})
		return
	}
	if owner {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot mute the group owner"})
		return
	}

	var req MuteGroupMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	var expiresAt *time.Time
	if req.DurationMinutes > 0 {
		t := time.Now().Add(time.Duration(req.DurationMinutes) * time.Minute)
		expiresAt = &t
	}

	_, err = h.pool.Exec(ctx, `
		INSERT INTO group_member_restrictions (conversation_id, user_id, restricted_by, restriction_type, reason, expires_at)
		VALUES ($1, $2, $3, 'mute', $4, $5)
		ON CONFLICT (conversation_id, user_id, restriction_type) DO UPDATE
		  SET restricted_by = EXCLUDED.restricted_by,
		      reason        = EXCLUDED.reason,
		      expires_at    = EXCLUDED.expires_at,
		      created_at    = NOW()
	`, convID, targetUserID, callerID, req.Reason, expiresAt)
	if err != nil {
		log.Printf("[GroupAdmin] MuteGroupMember: err=%v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mute member"})
		return
	}

	logAuditAction(ctx, h.pool, convID, callerID, "mute_member", &targetUserID, map[string]any{
		"reason":           req.Reason,
		"duration_minutes": req.DurationMinutes,
	})

	broadcastToGroup(ctx, h.pool, h.hub, convID, "group_member_muted", gin.H{
		"conversation_id": convID,
		"user_id":         targetUserID,
		"expires_at":      expiresAt,
		"reason":          req.Reason,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Member muted"})
}

// UnmuteGroupMember DELETE /groups/:id/members/:user_id/mute
func (h *GroupAdminHandler) UnmuteGroupMember(c *gin.Context) {
	convID, ok := parseGroupID(c)
	if !ok {
		return
	}
	targetUserID, ok := parseTargetUserID(c)
	if !ok {
		return
	}
	callerID, ok := getCallerID(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	if _, err := requireGroupAdmin(ctx, h.pool, convID, callerID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group admins can perform this action"})
		return
	}

	_, err := h.pool.Exec(ctx, `
		DELETE FROM group_member_restrictions
		WHERE conversation_id=$1 AND user_id=$2 AND restriction_type='mute'
	`, convID, targetUserID)
	if err != nil {
		log.Printf("[GroupAdmin] UnmuteGroupMember: err=%v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unmute member"})
		return
	}

	logAuditAction(ctx, h.pool, convID, callerID, "unmute_member", &targetUserID, nil)

	broadcastToGroup(ctx, h.pool, h.hub, convID, "group_member_unmuted", gin.H{
		"conversation_id": convID,
		"user_id":         targetUserID,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Member unmuted"})
}

// BanGroupMember POST /groups/:id/members/:user_id/ban
func (h *GroupAdminHandler) BanGroupMember(c *gin.Context) {
	convID, ok := parseGroupID(c)
	if !ok {
		return
	}
	targetUserID, ok := parseTargetUserID(c)
	if !ok {
		return
	}
	callerID, ok := getCallerID(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	if _, err := requireGroupAdmin(ctx, h.pool, convID, callerID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group admins can perform this action"})
		return
	}

	owner, err := isGroupOwner(ctx, h.pool, convID, targetUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check target role"})
		return
	}
	if owner {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot ban the group owner"})
		return
	}

	var req BanGroupMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	_, err = h.pool.Exec(ctx, `
		INSERT INTO group_member_restrictions (conversation_id, user_id, restricted_by, restriction_type, reason, expires_at)
		VALUES ($1, $2, $3, 'ban', $4, NULL)
		ON CONFLICT (conversation_id, user_id, restriction_type) DO UPDATE
		  SET restricted_by = EXCLUDED.restricted_by,
		      reason        = EXCLUDED.reason,
		      expires_at    = NULL,
		      created_at    = NOW()
	`, convID, targetUserID, callerID, req.Reason)
	if err != nil {
		log.Printf("[GroupAdmin] BanGroupMember: insert restriction err=%v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to ban member"})
		return
	}

	if req.DeleteMessages {
		if _, err := h.pool.Exec(ctx, `
			UPDATE messages SET deleted_by_admin=TRUE WHERE conversation_id=$1 AND sender_id=$2
		`, convID, targetUserID); err != nil {
			log.Printf("[GroupAdmin] BanGroupMember: delete messages err=%v", err)
		}
	}

	if _, err := h.pool.Exec(ctx, `
		DELETE FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2
	`, convID, targetUserID); err != nil {
		log.Printf("[GroupAdmin] BanGroupMember: remove participant err=%v", err)
	}

	logAuditAction(ctx, h.pool, convID, callerID, "ban_member", &targetUserID, map[string]any{
		"reason":          req.Reason,
		"delete_messages": req.DeleteMessages,
	})

	broadcastToGroup(ctx, h.pool, h.hub, convID, "group_member_banned", gin.H{
		"conversation_id": convID,
		"user_id":         targetUserID,
		"reason":          req.Reason,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Member banned"})
}

// UnbanGroupMember DELETE /groups/:id/members/:user_id/ban
func (h *GroupAdminHandler) UnbanGroupMember(c *gin.Context) {
	convID, ok := parseGroupID(c)
	if !ok {
		return
	}
	targetUserID, ok := parseTargetUserID(c)
	if !ok {
		return
	}
	callerID, ok := getCallerID(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	if _, err := requireGroupAdmin(ctx, h.pool, convID, callerID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group admins can perform this action"})
		return
	}

	_, err := h.pool.Exec(ctx, `
		DELETE FROM group_member_restrictions
		WHERE conversation_id=$1 AND user_id=$2 AND restriction_type='ban'
	`, convID, targetUserID)
	if err != nil {
		log.Printf("[GroupAdmin] UnbanGroupMember: err=%v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unban member"})
		return
	}

	logAuditAction(ctx, h.pool, convID, callerID, "unban_member", &targetUserID, nil)

	c.JSON(http.StatusOK, gin.H{"message": "Member unbanned"})
}

// GetGroupRestrictions GET /groups/:id/restrictions
func (h *GroupAdminHandler) GetGroupRestrictions(c *gin.Context) {
	convID, ok := parseGroupID(c)
	if !ok {
		return
	}
	callerID, ok := getCallerID(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	if _, err := requireGroupAdmin(ctx, h.pool, convID, callerID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group admins can view restrictions"})
		return
	}

	rows, err := h.pool.Query(ctx, `
		SELECT gmr.id, gmr.conversation_id, gmr.user_id, u.username,
		       gmr.restricted_by, a.username,
		       gmr.restriction_type, gmr.reason, gmr.expires_at, gmr.created_at
		FROM group_member_restrictions gmr
		JOIN users u ON u.id = gmr.user_id
		JOIN users a ON a.id = gmr.restricted_by
		WHERE gmr.conversation_id = $1
		  AND (gmr.expires_at IS NULL OR gmr.expires_at > NOW())
		ORDER BY gmr.created_at DESC
		LIMIT 100
	`, convID)
	if err != nil {
		log.Printf("[GroupAdmin] GetGroupRestrictions: err=%v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get restrictions"})
		return
	}
	defer rows.Close()

	restrictions := make([]GroupRestrictionRow, 0)
	for rows.Next() {
		var r GroupRestrictionRow
		if err := rows.Scan(
			&r.ID, &r.ConversationID, &r.UserID, &r.TargetUsername,
			&r.RestrictedBy, &r.RestrictedByUsername,
			&r.RestrictionType, &r.Reason, &r.ExpiresAt, &r.CreatedAt,
		); err != nil {
			log.Printf("[GroupAdmin] GetGroupRestrictions: scan err=%v", err)
			continue
		}
		restrictions = append(restrictions, r)
	}

	c.JSON(http.StatusOK, gin.H{"restrictions": restrictions})
}

// GetMyGroupRestriction GET /groups/:id/my-restriction
func (h *GroupAdminHandler) GetMyGroupRestriction(c *gin.Context) {
	convID, ok := parseGroupID(c)
	if !ok {
		return
	}
	callerID, ok := getCallerID(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	var r GroupRestrictionRow
	err := h.pool.QueryRow(ctx, `
		SELECT id, conversation_id, user_id, restricted_by,
		       restriction_type, reason, expires_at, created_at
		FROM group_member_restrictions
		WHERE conversation_id = $1 AND user_id = $2
		  AND (expires_at IS NULL OR expires_at > NOW())
		ORDER BY restriction_type ASC
		LIMIT 1
	`, convID, callerID).Scan(
		&r.ID, &r.ConversationID, &r.UserID, &r.RestrictedBy,
		&r.RestrictionType, &r.Reason, &r.ExpiresAt, &r.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{"restriction": nil})
			return
		}
		log.Printf("[GroupAdmin] GetMyGroupRestriction: err=%v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check restriction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"restriction": r})
}

// AdminDeleteMessage DELETE /groups/:id/messages/:message_id
func (h *GroupAdminHandler) AdminDeleteMessage(c *gin.Context) {
	convID, ok := parseGroupID(c)
	if !ok {
		return
	}
	callerID, ok := getCallerID(c)
	if !ok {
		return
	}

	messageIDStr := c.Param("message_id")
	messageID, err := strconv.Atoi(messageIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	ctx := c.Request.Context()

	if _, err := requireGroupAdmin(ctx, h.pool, convID, callerID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group admins can delete messages"})
		return
	}

	tag, err := h.pool.Exec(ctx, `
		UPDATE messages SET deleted_by_admin=TRUE WHERE id=$1 AND conversation_id=$2
	`, messageID, convID)
	if err != nil {
		log.Printf("[GroupAdmin] AdminDeleteMessage: err=%v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
		return
	}

	logAuditAction(ctx, h.pool, convID, callerID, "delete_message", nil, map[string]any{
		"message_id": messageID,
	})

	broadcastToGroup(ctx, h.pool, h.hub, convID, "group_message_deleted_by_admin", gin.H{
		"conversation_id": convID,
		"message_id":      messageID,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Message deleted"})
}

// SetSlowMode PUT /groups/:id/slow-mode
func (h *GroupAdminHandler) SetSlowMode(c *gin.Context) {
	convID, ok := parseGroupID(c)
	if !ok {
		return
	}
	callerID, ok := getCallerID(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	if _, err := requireGroupAdmin(ctx, h.pool, convID, callerID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group admins can set slow mode"})
		return
	}

	var req SetSlowModeRequest
	// Allow seconds=0 so we can't use "required" tag — bind manually
	if err := c.ShouldBindJSON(&req); err != nil {
		// Try binding without required validation
		type rawReq struct {
			Seconds *int `json:"seconds"`
		}
		var raw rawReq
		if err2 := c.ShouldBindJSON(&raw); err2 != nil || raw.Seconds == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "seconds field is required"})
			return
		}
		req.Seconds = *raw.Seconds
	}

	allowed := map[int]bool{0: true, 10: true, 30: true, 60: true, 300: true, 600: true, 1800: true, 3600: true}
	if !allowed[req.Seconds] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid slow mode value. Allowed: 0,10,30,60,300,600,1800,3600"})
		return
	}

	if _, err := h.pool.Exec(ctx, `UPDATE conversations SET slow_mode_seconds=$1 WHERE id=$2`, req.Seconds, convID); err != nil {
		log.Printf("[GroupAdmin] SetSlowMode: err=%v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set slow mode"})
		return
	}

	logAuditAction(ctx, h.pool, convID, callerID, "set_slow_mode", nil, map[string]any{
		"seconds": req.Seconds,
	})

	broadcastToGroup(ctx, h.pool, h.hub, convID, "group_slow_mode_updated", gin.H{
		"conversation_id":  convID,
		"slow_mode_seconds": req.Seconds,
	})

	c.JSON(http.StatusOK, gin.H{"slow_mode_seconds": req.Seconds})
}

// GetAuditLog GET /groups/:id/audit-log
func (h *GroupAdminHandler) GetAuditLog(c *gin.Context) {
	convID, ok := parseGroupID(c)
	if !ok {
		return
	}
	callerID, ok := getCallerID(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	if _, err := requireGroupAdmin(ctx, h.pool, convID, callerID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group admins can view the audit log"})
		return
	}

	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	actionTypeFilter := c.Query("action_type")

	var cursor int
	if cur := c.Query("cursor"); cur != "" {
		if parsed, err := strconv.Atoi(cur); err == nil {
			cursor = parsed
		}
	}

	query := `
		SELECT gal.id, gal.conversation_id, gal.admin_id, a.username,
		       gal.action_type, gal.target_user_id,
		       CASE WHEN gal.target_user_id IS NOT NULL THEN tu.username ELSE NULL END,
		       gal.details, gal.created_at
		FROM group_audit_log gal
		JOIN users a ON a.id = gal.admin_id
		LEFT JOIN users tu ON tu.id = gal.target_user_id
		WHERE gal.conversation_id = $1
	`
	args := []any{convID}
	argIdx := 2

	if cursor > 0 {
		query += fmt.Sprintf(" AND gal.id < $%d", argIdx)
		args = append(args, cursor)
		argIdx++
	}
	if actionTypeFilter != "" {
		query += fmt.Sprintf(" AND gal.action_type = $%d", argIdx)
		args = append(args, actionTypeFilter)
		argIdx++
	}
	query += fmt.Sprintf(" ORDER BY gal.id DESC LIMIT $%d", argIdx)
	args = append(args, limit+1)

	rows, err := h.pool.Query(ctx, query, args...)
	if err != nil {
		log.Printf("[GroupAdmin] GetAuditLog: err=%v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get audit log"})
		return
	}
	defer rows.Close()

	entries := make([]AuditLogRow, 0)
	for rows.Next() {
		var entry AuditLogRow
		var detailsRaw []byte
		if err := rows.Scan(
			&entry.ID, &entry.ConversationID, &entry.AdminID, &entry.AdminUsername,
			&entry.ActionType, &entry.TargetUserID, &entry.TargetUsername,
			&detailsRaw, &entry.CreatedAt,
		); err != nil {
			log.Printf("[GroupAdmin] GetAuditLog: scan err=%v", err)
			continue
		}
		if detailsRaw != nil {
			if err := json.Unmarshal(detailsRaw, &entry.Details); err != nil {
				log.Printf("[GroupAdmin] GetAuditLog: unmarshal details err=%v", err)
			}
		}
		entries = append(entries, entry)
	}

	var nextCursor *int
	if len(entries) > limit {
		entries = entries[:limit]
		id := entries[len(entries)-1].ID
		nextCursor = &id
	}

	c.JSON(http.StatusOK, gin.H{
		"audit_log":   entries,
		"next_cursor": nextCursor,
	})
}

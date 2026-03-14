package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/websocket"
)

// CallsHandler handles HTTP requests for voice and video calls.
type CallsHandler struct {
	pool *pgxpool.Pool
	hub  HubInterface
	turn config.TURNConfig
}

// NewCallsHandler creates a new CallsHandler.
func NewCallsHandler(pool *pgxpool.Pool, hub HubInterface, turn config.TURNConfig) *CallsHandler {
	return &CallsHandler{pool: pool, hub: hub, turn: turn}
}

// startCallRequest is the request body for starting a call.
type startCallRequest struct {
	CallType string `json:"call_type" binding:"required,oneof=voice video"`
}

// signalRequest is the request body for sending a WebRTC signal.
type signalRequest struct {
	SignalType string      `json:"signal_type" binding:"required,oneof=offer answer candidate"`
	SDP        *string     `json:"sdp,omitempty"`
	Candidate  interface{} `json:"candidate,omitempty"`
}

// callsIsConversationParticipant checks whether userID is a participant in conversationID.
func (h *CallsHandler) callsIsConversationParticipant(ctx context.Context, conversationID, userID int) (bool, error) {
	var exists bool
	err := h.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM conversations
			WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)
		)
	`, conversationID, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("callsIsConversationParticipant: %w", err)
	}
	return exists, nil
}

// callsGetOtherParticipant returns the other user in a direct conversation.
func (h *CallsHandler) callsGetOtherParticipant(ctx context.Context, conversationID, callerID int) (int, string, error) {
	var calleeID int
	var calleeUsername string
	err := h.pool.QueryRow(ctx, `
		SELECT
			CASE WHEN c.user1_id = $2 THEN c.user2_id ELSE c.user1_id END AS callee_id,
			u.username
		FROM conversations c
		JOIN users u ON u.id = CASE WHEN c.user1_id = $2 THEN c.user2_id ELSE c.user1_id END
		WHERE c.id = $1
	`, conversationID, callerID).Scan(&calleeID, &calleeUsername)
	if err != nil {
		return 0, "", fmt.Errorf("callsGetOtherParticipant: %w", err)
	}
	return calleeID, calleeUsername, nil
}

// StartCall handles POST /api/v1/conversations/:id/calls
// @Summary Start a voice or video call
// @Tags calls
// @Accept json
// @Produce json
// @Param id path int true "Conversation ID"
// @Param body body startCallRequest true "Call type"
// @Success 201 {object} models.Call
// @Failure 400 {object} gin.H
// @Failure 403 {object} gin.H
// @Router /conversations/{id}/calls [post]
func (h *CallsHandler) StartCall(c *gin.Context) {
	callerID := c.GetInt("user_id")

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	var req startCallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	ctx := c.Request.Context()

	ok, err := h.callsIsConversationParticipant(ctx, conversationID, callerID)
	if err != nil {
		log.Printf("[CallsHandler] StartCall: check participant error: conversation_id=%d caller_id=%d err=%v", conversationID, callerID, err)
		RespondError(c, http.StatusInternalServerError, "Internal server error")
		return
	}
	if !ok {
		RespondError(c, http.StatusForbidden, "Not a participant in this conversation")
		return
	}

	calleeID, calleeUsername, err := h.callsGetOtherParticipant(ctx, conversationID, callerID)
	if err != nil {
		log.Printf("[CallsHandler] StartCall: get other participant error: conversation_id=%d caller_id=%d err=%v", conversationID, callerID, err)
		RespondError(c, http.StatusInternalServerError, "Internal server error")
		return
	}

	// Look up caller username for the event payload.
	var callerUsername string
	if err := h.pool.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, callerID).Scan(&callerUsername); err != nil {
		log.Printf("[CallsHandler] StartCall: get caller username error: caller_id=%d err=%v", callerID, err)
		RespondError(c, http.StatusInternalServerError, "Internal server error")
		return
	}

	var call models.Call
	err = h.pool.QueryRow(ctx, `
		INSERT INTO calls (conversation_id, caller_id, callee_id, call_type, status, started_at)
		VALUES ($1, $2, $3, $4, 'ringing', NOW())
		RETURNING id, conversation_id, caller_id, callee_id, call_type, status, started_at
	`, conversationID, callerID, calleeID, req.CallType).Scan(
		&call.ID,
		&call.ConversationID,
		&call.CallerID,
		&call.CalleeID,
		&call.CallType,
		&call.Status,
		&call.StartedAt,
	)
	if err != nil {
		log.Printf("[CallsHandler] StartCall: insert call error: conversation_id=%d caller_id=%d err=%v", conversationID, callerID, err)
		RespondError(c, http.StatusInternalServerError, "Internal server error")
		return
	}

	_ = calleeUsername // used in WS event below

	// Broadcast incoming call event to callee.
	if h.hub != nil {
		h.hub.Broadcast(&websocket.Message{
			RecipientID: calleeID,
			Type:        "call_incoming",
			Payload: gin.H{
				"call_id":         call.ID,
				"caller_id":       callerID,
				"caller_username": callerUsername,
				"call_type":       call.CallType,
				"conversation_id": conversationID,
			},
		})
	}

	c.JSON(http.StatusCreated, call)
}

// AnswerCall handles POST /api/v1/calls/:id/answer
// @Summary Answer an incoming call
// @Tags calls
// @Produce json
// @Param id path int true "Call ID"
// @Success 200 {object} models.Call
// @Failure 400 {object} gin.H
// @Failure 403 {object} gin.H
// @Failure 409 {object} gin.H
// @Router /calls/{id}/answer [post]
func (h *CallsHandler) AnswerCall(c *gin.Context) {
	userID := c.GetInt("user_id")

	callID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid call ID")
		return
	}

	ctx := c.Request.Context()

	var call models.Call
	err = h.pool.QueryRow(ctx, `
		SELECT id, conversation_id, caller_id, callee_id, call_type, status, started_at
		FROM calls WHERE id = $1
	`, callID).Scan(
		&call.ID, &call.ConversationID, &call.CallerID, &call.CalleeID,
		&call.CallType, &call.Status, &call.StartedAt,
	)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Call not found")
		return
	}

	if call.CalleeID != userID {
		RespondError(c, http.StatusForbidden, "Not authorized to answer this call")
		return
	}
	if call.Status != "ringing" {
		RespondError(c, http.StatusConflict, "Call is not in ringing state")
		return
	}

	now := time.Now()
	_, err = h.pool.Exec(ctx, `
		UPDATE calls SET status = 'active', answered_at = $1 WHERE id = $2
	`, now, callID)
	if err != nil {
		log.Printf("[CallsHandler] AnswerCall: update error: call_id=%d err=%v", callID, err)
		RespondError(c, http.StatusInternalServerError, "Internal server error")
		return
	}

	call.Status = "active"
	call.AnsweredAt = &now

	if h.hub != nil {
		h.hub.Broadcast(&websocket.Message{
			RecipientID: call.CallerID,
			Type:        "call_answered",
			Payload:     gin.H{"call_id": callID},
		})
	}

	c.JSON(http.StatusOK, call)
}

// RejectCall handles POST /api/v1/calls/:id/reject
// @Summary Reject an incoming call
// @Tags calls
// @Produce json
// @Param id path int true "Call ID"
// @Success 200 {object} models.Call
// @Failure 400 {object} gin.H
// @Failure 403 {object} gin.H
// @Failure 409 {object} gin.H
// @Router /calls/{id}/reject [post]
func (h *CallsHandler) RejectCall(c *gin.Context) {
	userID := c.GetInt("user_id")

	callID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid call ID")
		return
	}

	ctx := c.Request.Context()

	var call models.Call
	err = h.pool.QueryRow(ctx, `
		SELECT id, conversation_id, caller_id, callee_id, call_type, status, started_at
		FROM calls WHERE id = $1
	`, callID).Scan(
		&call.ID, &call.ConversationID, &call.CallerID, &call.CalleeID,
		&call.CallType, &call.Status, &call.StartedAt,
	)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Call not found")
		return
	}

	if call.CalleeID != userID {
		RespondError(c, http.StatusForbidden, "Not authorized to reject this call")
		return
	}
	if call.Status != "ringing" {
		RespondError(c, http.StatusConflict, "Call is not in ringing state")
		return
	}

	now := time.Now()
	_, err = h.pool.Exec(ctx, `
		UPDATE calls SET status = 'rejected', ended_at = $1 WHERE id = $2
	`, now, callID)
	if err != nil {
		log.Printf("[CallsHandler] RejectCall: update error: call_id=%d err=%v", callID, err)
		RespondError(c, http.StatusInternalServerError, "Internal server error")
		return
	}

	call.Status = "rejected"
	call.EndedAt = &now

	if h.hub != nil {
		h.hub.Broadcast(&websocket.Message{
			RecipientID: call.CallerID,
			Type:        "call_rejected",
			Payload:     gin.H{"call_id": callID},
		})
	}

	c.JSON(http.StatusOK, call)
}

// EndCall handles POST /api/v1/calls/:id/end
// @Summary End an active or ringing call
// @Tags calls
// @Produce json
// @Param id path int true "Call ID"
// @Success 200 {object} models.Call
// @Failure 400 {object} gin.H
// @Failure 403 {object} gin.H
// @Failure 409 {object} gin.H
// @Router /calls/{id}/end [post]
func (h *CallsHandler) EndCall(c *gin.Context) {
	userID := c.GetInt("user_id")

	callID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid call ID")
		return
	}

	ctx := c.Request.Context()

	var call models.Call
	err = h.pool.QueryRow(ctx, `
		SELECT id, conversation_id, caller_id, callee_id, call_type, status, started_at, answered_at
		FROM calls WHERE id = $1
	`, callID).Scan(
		&call.ID, &call.ConversationID, &call.CallerID, &call.CalleeID,
		&call.CallType, &call.Status, &call.StartedAt, &call.AnsweredAt,
	)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Call not found")
		return
	}

	if call.CallerID != userID && call.CalleeID != userID {
		RespondError(c, http.StatusForbidden, "Not authorized to end this call")
		return
	}
	if call.Status != "ringing" && call.Status != "active" {
		RespondError(c, http.StatusConflict, "Call is already ended")
		return
	}

	now := time.Now()
	var durationSeconds *int
	if call.AnsweredAt != nil {
		d := int(now.Sub(*call.AnsweredAt).Seconds())
		durationSeconds = &d
	}

	_, err = h.pool.Exec(ctx, `
		UPDATE calls
		SET status = 'ended', ended_at = $1, duration_seconds = $2, ended_by = $3
		WHERE id = $4
	`, now, durationSeconds, userID, callID)
	if err != nil {
		log.Printf("[CallsHandler] EndCall: update error: call_id=%d err=%v", callID, err)
		RespondError(c, http.StatusInternalServerError, "Internal server error")
		return
	}

	call.Status = "ended"
	call.EndedAt = &now
	call.DurationSeconds = durationSeconds
	call.EndedBy = &userID

	// Notify the other party.
	otherID := call.CalleeID
	if userID == call.CalleeID {
		otherID = call.CallerID
	}

	if h.hub != nil {
		h.hub.Broadcast(&websocket.Message{
			RecipientID: otherID,
			Type:        "call_ended",
			Payload:     gin.H{"call_id": callID, "duration_seconds": durationSeconds},
		})
	}

	c.JSON(http.StatusOK, call)
}

// Signal handles POST /api/v1/calls/:id/signal
// @Summary Relay a WebRTC signaling message
// @Tags calls
// @Accept json
// @Produce json
// @Param id path int true "Call ID"
// @Param body body signalRequest true "Signal payload"
// @Success 200 {object} gin.H
// @Failure 400 {object} gin.H
// @Failure 403 {object} gin.H
// @Router /calls/{id}/signal [post]
func (h *CallsHandler) Signal(c *gin.Context) {
	userID := c.GetInt("user_id")

	callID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid call ID")
		return
	}

	var req signalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	ctx := c.Request.Context()

	var callerID, calleeID int
	var status string
	err = h.pool.QueryRow(ctx, `
		SELECT caller_id, callee_id, status FROM calls WHERE id = $1
	`, callID).Scan(&callerID, &calleeID, &status)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Call not found")
		return
	}

	if userID != callerID && userID != calleeID {
		RespondError(c, http.StatusForbidden, "Not authorized to signal in this call")
		return
	}

	// Relay to the other party.
	recipientID := calleeID
	if userID == calleeID {
		recipientID = callerID
	}

	payload := gin.H{
		"call_id":     callID,
		"signal_type": req.SignalType,
	}
	if req.SDP != nil {
		payload["sdp"] = *req.SDP
	}
	if req.Candidate != nil {
		payload["candidate"] = req.Candidate
	}

	if h.hub != nil {
		h.hub.Broadcast(&websocket.Message{
			RecipientID: recipientID,
			Type:        "call_signal",
			Payload:     payload,
		})
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetICEServers handles GET /api/v1/calls/ice-servers
// @Summary Get ICE server configuration for WebRTC
// @Tags calls
// @Produce json
// @Success 200 {object} gin.H
// @Router /calls/ice-servers [get]
func (h *CallsHandler) GetICEServers(c *gin.Context) {
	iceServers := []gin.H{
		{"urls": "stun:stun.l.google.com:19302"},
		{"urls": "stun:stun1.l.google.com:19302"},
	}

	if h.turn.Host != "" && h.turn.Secret != "" {
		// Generate time-limited HMAC-SHA1 credentials (RFC 5389 / coturn compatible).
		// Username encodes expiry so credentials self-expire after 24h.
		expiry := time.Now().Add(24 * time.Hour).Unix()
		username := fmt.Sprintf("%d", expiry)
		mac := hmac.New(sha1.New, []byte(h.turn.Secret))
		mac.Write([]byte(username))
		password := base64.StdEncoding.EncodeToString(mac.Sum(nil))

		turnURL := fmt.Sprintf("turn:%s:%s", h.turn.Host, h.turn.Port)
		turnsURL := fmt.Sprintf("turns:%s:%s?transport=tcp", h.turn.Host, "5349")
		iceServers = append(iceServers,
			gin.H{"urls": turnURL, "username": username, "credential": password},
			gin.H{"urls": turnsURL, "username": username, "credential": password},
		)
	}

	c.JSON(http.StatusOK, gin.H{"ice_servers": iceServers})
}

// StartScreenShare handles POST /api/v1/calls/:id/screen-share/start
// @Summary Signal that the caller has started screen sharing
// @Tags calls
// @Produce json
// @Param id path int true "Call ID"
// @Success 200 {object} gin.H
// @Failure 400 {object} gin.H
// @Failure 403 {object} gin.H
// @Router /calls/{id}/screen-share/start [post]
func (h *CallsHandler) StartScreenShare(c *gin.Context) {
	userID := c.GetInt("user_id")

	callID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid call ID")
		return
	}

	ctx := c.Request.Context()

	var callerID, calleeID int
	var status string
	err = h.pool.QueryRow(ctx, `
		SELECT caller_id, callee_id, status FROM calls WHERE id = $1
	`, callID).Scan(&callerID, &calleeID, &status)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Call not found")
		return
	}

	if userID != callerID && userID != calleeID {
		RespondError(c, http.StatusForbidden, "Not authorized to modify this call")
		return
	}

	_, err = h.pool.Exec(ctx, `
		UPDATE calls SET is_screen_sharing = TRUE, screen_share_started_at = NOW() WHERE id = $1
	`, callID)
	if err != nil {
		log.Printf("[CallsHandler] StartScreenShare: update error: call_id=%d err=%v", callID, err)
		RespondError(c, http.StatusInternalServerError, "Internal server error")
		return
	}

	// Notify the other participant.
	otherID := calleeID
	if userID == calleeID {
		otherID = callerID
	}

	if h.hub != nil {
		h.hub.Broadcast(&websocket.Message{
			RecipientID: otherID,
			Type:        "screen_share_started",
			Payload:     gin.H{"call_id": callID, "sharer_id": userID},
		})
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// StopScreenShare handles POST /api/v1/calls/:id/screen-share/stop
// @Summary Signal that the caller has stopped screen sharing
// @Tags calls
// @Produce json
// @Param id path int true "Call ID"
// @Success 200 {object} gin.H
// @Failure 400 {object} gin.H
// @Failure 403 {object} gin.H
// @Router /calls/{id}/screen-share/stop [post]
func (h *CallsHandler) StopScreenShare(c *gin.Context) {
	userID := c.GetInt("user_id")

	callID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid call ID")
		return
	}

	ctx := c.Request.Context()

	var callerID, calleeID int
	var status string
	err = h.pool.QueryRow(ctx, `
		SELECT caller_id, callee_id, status FROM calls WHERE id = $1
	`, callID).Scan(&callerID, &calleeID, &status)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Call not found")
		return
	}

	if userID != callerID && userID != calleeID {
		RespondError(c, http.StatusForbidden, "Not authorized to modify this call")
		return
	}

	_, err = h.pool.Exec(ctx, `
		UPDATE calls SET is_screen_sharing = FALSE, screen_share_ended_at = NOW() WHERE id = $1
	`, callID)
	if err != nil {
		log.Printf("[CallsHandler] StopScreenShare: update error: call_id=%d err=%v", callID, err)
		RespondError(c, http.StatusInternalServerError, "Internal server error")
		return
	}

	// Notify the other participant.
	otherID := calleeID
	if userID == calleeID {
		otherID = callerID
	}

	if h.hub != nil {
		h.hub.Broadcast(&websocket.Message{
			RecipientID: otherID,
			Type:        "screen_share_stopped",
			Payload:     gin.H{"call_id": callID},
		})
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetCallHistory handles GET /api/v1/conversations/:id/calls
// @Summary Get call history for a conversation
// @Tags calls
// @Produce json
// @Param id path int true "Conversation ID"
// @Param limit query int false "Page size (max 50)" default(20)
// @Param before query int false "Cursor: call ID to paginate before"
// @Success 200 {object} gin.H
// @Failure 400 {object} gin.H
// @Failure 403 {object} gin.H
// @Router /conversations/{id}/calls [get]
func (h *CallsHandler) GetCallHistory(c *gin.Context) {
	userID := c.GetInt("user_id")

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	limit := 20
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 50 {
		limit = l
	}

	ctx := c.Request.Context()

	ok, err := h.callsIsConversationParticipant(ctx, conversationID, userID)
	if err != nil {
		log.Printf("[CallsHandler] GetCallHistory: check participant error: conversation_id=%d user_id=%d err=%v", conversationID, userID, err)
		RespondError(c, http.StatusInternalServerError, "Internal server error")
		return
	}
	if !ok {
		RespondError(c, http.StatusForbidden, "Not a participant in this conversation")
		return
	}

	// Build query with optional cursor.
	var query string
	var args []interface{}

	beforeID, beforeErr := strconv.Atoi(c.Query("before"))
	if beforeErr != nil || beforeID <= 0 {
		query = `
			SELECT
				c.id, c.conversation_id, c.caller_id, c.callee_id, c.call_type, c.status,
				c.started_at, c.answered_at, c.ended_at, c.duration_seconds, c.ended_by,
				caller.username AS caller_username,
				callee.username AS callee_username
			FROM calls c
			JOIN users caller ON caller.id = c.caller_id
			JOIN users callee ON callee.id = c.callee_id
			WHERE c.conversation_id = $1
			ORDER BY c.started_at DESC
			LIMIT $2
		`
		args = []interface{}{conversationID, limit}
	} else {
		query = `
			SELECT
				c.id, c.conversation_id, c.caller_id, c.callee_id, c.call_type, c.status,
				c.started_at, c.answered_at, c.ended_at, c.duration_seconds, c.ended_by,
				caller.username AS caller_username,
				callee.username AS callee_username
			FROM calls c
			JOIN users caller ON caller.id = c.caller_id
			JOIN users callee ON callee.id = c.callee_id
			WHERE c.conversation_id = $1 AND c.id < $2
			ORDER BY c.started_at DESC
			LIMIT $3
		`
		args = []interface{}{conversationID, beforeID, limit}
	}

	r, err := h.pool.Query(ctx, query, args...)
	if err != nil {
		log.Printf("[CallsHandler] GetCallHistory: query error: conversation_id=%d err=%v", conversationID, err)
		RespondError(c, http.StatusInternalServerError, "Internal server error")
		return
	}
	defer r.Close()

	calls := make([]models.Call, 0, limit)
	for r.Next() {
		var call models.Call
		if scanErr := r.Scan(
			&call.ID, &call.ConversationID, &call.CallerID, &call.CalleeID,
			&call.CallType, &call.Status, &call.StartedAt, &call.AnsweredAt,
			&call.EndedAt, &call.DurationSeconds, &call.EndedBy,
			&call.CallerUsername, &call.CalleeUsername,
		); scanErr != nil {
			log.Printf("[CallsHandler] GetCallHistory: scan error: %v", scanErr)
			continue
		}
		calls = append(calls, call)
	}
	if rowErr := r.Err(); rowErr != nil {
		log.Printf("[CallsHandler] GetCallHistory: rows error: %v", rowErr)
	}

	c.JSON(http.StatusOK, gin.H{"calls": calls, "limit": limit})
}

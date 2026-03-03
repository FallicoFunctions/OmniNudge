package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/api/middleware"
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/permissions"
)

// ModMailHandler handles mod mail conversations
type ModMailHandler struct {
	pool             *pgxpool.Pool
	conversationRepo ports.ConversationRepository
	messageRepo      ports.MessageRepository
	userRepo         ports.UserRepository
	hubModRepo       ports.HubModeratorRepository
	hubRepo          ports.HubRepository
}

// NewModMailHandler creates a new mod mail handler
func NewModMailHandler(
	pool *pgxpool.Pool,
	conversationRepo ports.ConversationRepository,
	messageRepo ports.MessageRepository,
	userRepo ports.UserRepository,
	hubModRepo ports.HubModeratorRepository,
	hubRepo ports.HubRepository,
) *ModMailHandler {
	return &ModMailHandler{
		pool:             pool,
		conversationRepo: conversationRepo,
		messageRepo:      messageRepo,
		userRepo:         userRepo,
		hubModRepo:       hubModRepo,
		hubRepo:          hubRepo,
	}
}

// CreateModMailRequest represents a request to start a mod mail conversation
type CreateModMailRequest struct {
	HubName                string         `json:"hub_name" binding:"required"`
	Subject                string         `json:"subject" binding:"required,max=300"`
	Message                string         `json:"message"` // Plaintext fallback
	EncryptedContent       string         `json:"encrypted_content"`
	SenderEncryptedContent *string        `json:"sender_encrypted_content,omitempty"`
	EncryptionVersion      string         `json:"encryption_version"`
	IsMultiRecipient       bool           `json:"is_multi_recipient"`
	SharedEncryptionIV     *string        `json:"shared_encryption_iv,omitempty"`
	RecipientKeys          map[int]string `json:"recipient_keys,omitempty"`
}

// ModMailConversationDetails includes conversation info with participants
type ModMailConversationDetails struct {
	ID            int               `json:"id"`
	HubID         int               `json:"hub_id"`
	HubName       string            `json:"hub_name"`
	Subject       string            `json:"subject"`
	Status        string            `json:"status"`
	CreatedAt     time.Time         `json:"created_at"`
	LastMessageAt time.Time         `json:"last_message_at"`
	Participants  []ParticipantInfo `json:"participants"`
	LatestMessage *models.Message   `json:"latest_message,omitempty"`
	UnreadCount   int               `json:"unread_count"`
}

type ParticipantInfo struct {
	UserID      int     `json:"user_id"`
	Username    string  `json:"username"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	IsModerator bool    `json:"is_moderator"`
}

// Helper methods

// fetchParticipants retrieves all participants for a conversation
func (h *ModMailHandler) fetchParticipants(ctx context.Context, conversationID int) ([]ParticipantInfo, error) {
	participants := []ParticipantInfo{}

	partRows, err := h.pool.Query(ctx, `
		SELECT cp.user_id, u.username, u.avatar_url, cp.is_moderator
		FROM conversation_participants cp
		JOIN users u ON cp.user_id = u.id
		WHERE cp.conversation_id = $1
	`, conversationID)
	if err != nil {
		return nil, err
	}
	defer partRows.Close()

	for partRows.Next() {
		var p ParticipantInfo
		if err := partRows.Scan(&p.UserID, &p.Username, &p.AvatarURL, &p.IsModerator); err != nil {
			return nil, err
		}
		participants = append(participants, p)
	}

	return participants, nil
}

// enrichConversationDetails adds participants, latest message, and unread count to a conversation
func (h *ModMailHandler) enrichConversationDetails(ctx context.Context, conv *ModMailConversationDetails, userID int) error {
	// Fetch participants
	participants, err := h.fetchParticipants(ctx, conv.ID)
	if err != nil {
		return err
	}
	conv.Participants = participants

	// Get latest message
	latestMsg, err := h.messageRepo.GetLatestMessage(ctx, conv.ID, userID)
	if err == nil && latestMsg != nil {
		conv.LatestMessage = latestMsg
	}

	// Get unread count
	unreadCount, err := h.messageRepo.GetUnreadCount(ctx, conv.ID, userID)
	if err == nil {
		conv.UnreadCount = unreadCount
	}

	return nil
}

// GetModMailRecipients returns eligible recipients for a hub mod mail thread.
// @Summary      Get mod mail recipients
// @Tags         ModMail
// @Security     BearerAuth
// @Produce      json
// @Param        hub_name  path  string  true  "Hub name"
// @Success      200  {array}   gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /mod-mail/hubs/{hub_name}/recipients [get]
// GetModMailRecipients handles GET /api/v1/mod-mail/hubs/:hub_name/recipients
// Returns user IDs for hub moderators and admins for encryption recipients.
func (h *ModMailHandler) GetModMailRecipients(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("hub_name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get hub", "details": err.Error()})
		return
	}
	if hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	recipientIDs := map[int]struct{}{}

	rows, err := h.pool.Query(c.Request.Context(), `
		SELECT hm.user_id
		FROM hub_moderators hm
		WHERE hm.hub_id = $1
		  AND hm.user_id <> $2
		  AND NOT EXISTS (
		    SELECT 1
		    FROM blocked_users bu
		    WHERE (bu.blocker_id = $2 AND bu.blocked_id = hm.user_id)
		       OR (bu.blocked_id = $2 AND bu.blocker_id = hm.user_id)
		  )
	`, hub.ID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get moderators")
		return
	}
	for rows.Next() {
		var modID int
		if err := rows.Scan(&modID); err != nil {
			rows.Close()
			RespondError(c, http.StatusInternalServerError, "Failed to scan moderators")
			return
		}
		recipientIDs[modID] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		RespondError(c, http.StatusInternalServerError, "Failed to read moderators")
		return
	}
	rows.Close()

	adminRows, err := h.pool.Query(c.Request.Context(), `
		SELECT u.id
		FROM users u
		WHERE u.role = 'admin'
		  AND u.deleted = false
		  AND u.id <> $1
		  AND NOT EXISTS (
		    SELECT 1
		    FROM blocked_users bu
		    WHERE (bu.blocker_id = $1 AND bu.blocked_id = u.id)
		       OR (bu.blocked_id = $1 AND bu.blocker_id = u.id)
		  )
	`, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get admins")
		return
	}
	for adminRows.Next() {
		var adminID int
		if err := adminRows.Scan(&adminID); err != nil {
			adminRows.Close()
			RespondError(c, http.StatusInternalServerError, "Failed to scan admins")
			return
		}
		recipientIDs[adminID] = struct{}{}
	}
	if err := adminRows.Err(); err != nil {
		adminRows.Close()
		RespondError(c, http.StatusInternalServerError, "Failed to read admins")
		return
	}
	adminRows.Close()

	out := make([]int, 0, len(recipientIDs))
	for id := range recipientIDs {
		out = append(out, id)
	}

	c.JSON(http.StatusOK, gin.H{
		"hub_name":      hub.Name,
		"recipient_ids": out,
	})
}

// CreateModMail creates a new mod mail conversation.
// @Summary      Create mod mail
// @Tags         ModMail
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      201  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /mod-mail [post]
// CreateModMail handles POST /api/v1/mod-mail
// Allows any logged-in user to message the mods of a hub
func (h *ModMailHandler) CreateModMail(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req CreateModMailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	if strings.TrimSpace(req.Message) == "" && strings.TrimSpace(req.EncryptedContent) == "" {
		RespondError(c, http.StatusBadRequest, "Message content is required")
		return
	}

	// Default encryption version
	if req.EncryptionVersion == "" {
		if req.IsMultiRecipient {
			req.EncryptionVersion = "v2"
		} else {
			req.EncryptionVersion = "plaintext"
		}
	}

	// Get hub by name
	hub, err := h.hubRepo.GetByName(c.Request.Context(), req.HubName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get hub", "details": err.Error()})
		return
	}
	if hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	// Begin transaction
	tx, err := h.pool.Begin(c.Request.Context())
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback(c.Request.Context())

	// Create mod mail conversation
	var conversationID int
	err = tx.QueryRow(c.Request.Context(), `
		INSERT INTO conversations (conversation_type, hub_id, subject, status, created_at, last_message_at)
		VALUES ('mod_mail', $1, $2, 'open', NOW(), NOW())
		RETURNING id
	`, hub.ID, req.Subject).Scan(&conversationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create conversation", "details": err.Error()})
		return
	}

	// Add the user as a participant (non-moderator)
	_, err = tx.Exec(c.Request.Context(), `
		INSERT INTO conversation_participants (conversation_id, user_id, is_moderator, joined_at)
		VALUES ($1, $2, FALSE, NOW())
	`, conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to add participant")
		return
	}

	// Get all moderators of the hub
	rows, err := tx.Query(c.Request.Context(), `
		SELECT user_id FROM hub_moderators WHERE hub_id = $1
	`, hub.ID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get moderators")
		return
	}
	defer rows.Close()

	moderatorIDs := []int{}
	for rows.Next() {
		var modID int
		if err := rows.Scan(&modID); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to scan moderator")
			return
		}
		moderatorIDs = append(moderatorIDs, modID)
	}
	if err := rows.Err(); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to read moderators")
		return
	}

	// Prevent creating new mod mail conversations that include users with a block relationship.
	if len(moderatorIDs) > 0 {
		var hasBlockingConflict bool
		err = tx.QueryRow(c.Request.Context(), `
			SELECT EXISTS (
				SELECT 1
				FROM blocked_users bu
				WHERE (bu.blocker_id = $1 AND bu.blocked_id = ANY($2::int[]))
				   OR (bu.blocked_id = $1 AND bu.blocker_id = ANY($2::int[]))
			)
		`, userID, moderatorIDs).Scan(&hasBlockingConflict)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to check blocking relationships")
			return
		}
		if hasBlockingConflict {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Cannot create mod mail due to blocking settings with one or more moderators",
			})
			return
		}
	}

	// Add all moderators as participants (batch insert for better performance)
	if len(moderatorIDs) > 0 {
		_, err = tx.Exec(c.Request.Context(), `
			INSERT INTO conversation_participants (conversation_id, user_id, is_moderator, joined_at)
			SELECT $1, UNNEST($2::int[]), TRUE, NOW()
			ON CONFLICT (conversation_id, user_id) DO UPDATE SET is_moderator = TRUE
		`, conversationID, moderatorIDs)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to add moderators")
			return
		}
	}

	// Validate encryption payloads for multi-recipient encryption
	if req.IsMultiRecipient {
		if req.SharedEncryptionIV == nil || len(req.RecipientKeys) == 0 {
			RespondError(c, http.StatusBadRequest, "Missing encryption payloads for multi-recipient mod mail")
			return
		}

		// Note: We don't require ALL participants to have recipient_keys entries
		// Some users may not have public keys set up yet, and they won't be able to decrypt
		// until they enable encryption. The frontend warns about this.
	}

	// Create the first message (encrypted for all participants)
	var messageID int
	encryptedContent := req.EncryptedContent
	if encryptedContent == "" {
		encryptedContent = req.Message
	}

	isMulti := req.IsMultiRecipient && len(req.RecipientKeys) > 0 && req.SharedEncryptionIV != nil

	err = tx.QueryRow(c.Request.Context(), `
		INSERT INTO messages (
			conversation_id, sender_id, recipient_id, encrypted_content, sender_encrypted_content,
			message_type, media_file_id, media_url, media_type, media_size, encryption_version,
			media_encryption_key, media_encryption_iv, sender_media_encryption_key,
			is_multi_recipient, shared_encryption_iv
		)
		VALUES ($1, $2, $2, $3, $4, 'text', NULL, NULL, NULL, NULL, $5, NULL, NULL, NULL, $6, $7)
		RETURNING id
	`, conversationID, userID, encryptedContent, req.SenderEncryptedContent, req.EncryptionVersion, isMulti, req.SharedEncryptionIV).Scan(&messageID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create message", "details": err.Error()})
		return
	}

	if isMulti && len(req.RecipientKeys) > 0 {
		// Batch insert recipient keys for better performance
		var userIDs []int
		var encryptedKeys []string
		for pid, encryptedKey := range req.RecipientKeys {
			userIDs = append(userIDs, pid)
			encryptedKeys = append(encryptedKeys, encryptedKey)
		}

		_, err = tx.Exec(c.Request.Context(), `
			INSERT INTO message_recipient_keys (message_id, user_id, encrypted_key)
			SELECT $1, UNNEST($2::int[]), UNNEST($3::text[])
		`, messageID, userIDs, encryptedKeys)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store recipient keys", "details": err.Error()})
			return
		}
	}

	// Commit transaction
	if err := tx.Commit(c.Request.Context()); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to commit transaction")
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"conversation_id": conversationID,
		"message_id":      messageID,
		"hub_name":        req.HubName,
		"subject":         req.Subject,
	})
}

// GetModMailForHub returns mod mail conversations for a hub.
// @Summary      List hub mod mail
// @Tags         ModMail
// @Security     BearerAuth
// @Produce      json
// @Param        hub_name  path  string  true  "Hub name"
// @Success      200  {array}   gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /mod-mail/hubs/{hub_name} [get]
// GetModMailForHub handles GET /api/v1/mod-mail/hubs/:hub_name
// Returns all mod mail for a hub (moderators only)
func (h *ModMailHandler) GetModMailForHub(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("hub_name")
	status := c.DefaultQuery("status", "open") // open, archived, resolved, all

	// Get hub
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil || hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	// Check if user is a moderator of this hub (or admin)
	isMod, err := permissions.RequireHubModeratorOrAdmin(c, hub.ID, h.hubModRepo)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check permissions")
		return
	}
	if !isMod {
		RespondError(c, http.StatusForbidden, "Only moderators can access mod mail")
		return
	}

	// Build query based on status filter
	statusClause := ""
	args := []interface{}{hub.ID}
	if status != "all" {
		statusClause = " AND status = $2"
		args = append(args, status)
	}

	// Get mod mail conversations
	query := `
		SELECT c.id, c.hub_id, c.subject, c.status, c.created_at, c.last_message_at
		FROM conversations c
		WHERE c.hub_id = $1 AND c.conversation_type = 'mod_mail'` + statusClause + `
		ORDER BY c.last_message_at DESC
		LIMIT 50
	`

	rows, err := h.pool.Query(c.Request.Context(), query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get conversations", "details": err.Error()})
		return
	}
	defer rows.Close()

	conversations := []ModMailConversationDetails{}
	for rows.Next() {
		var conv ModMailConversationDetails
		if err := rows.Scan(&conv.ID, &conv.HubID, &conv.Subject, &conv.Status, &conv.CreatedAt, &conv.LastMessageAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan conversation", "details": err.Error()})
			return
		}
		conv.HubName = hubName
		conversations = append(conversations, conv)
	}

	// Enrich all conversations concurrently for better performance
	type enrichResult struct {
		index int
		err   error
	}

	resultsChan := make(chan enrichResult, len(conversations))

	for i := range conversations {
		go func(idx int) {
			err := h.enrichConversationDetails(c.Request.Context(), &conversations[idx], userID)
			resultsChan <- enrichResult{index: idx, err: err}
		}(i)
	}

	// Collect results
	for i := 0; i < len(conversations); i++ {
		result := <-resultsChan
		if result.err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to enrich conversation", "details": result.err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"conversations": conversations,
		"hub_name":      hubName,
		"status":        status,
	})
}

// GetUserModMail returns mod mail conversations for the current user.
// @Summary      Get my mod mail
// @Tags         ModMail
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}   gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /mod-mail/user [get]
// GetUserModMail handles GET /api/v1/mod-mail/user
// Returns all mod mail conversations the user has created
func (h *ModMailHandler) GetUserModMail(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	// Get conversations where user is a participant and is NOT a moderator
	query := `
		SELECT c.id, c.hub_id, c.subject, c.status, c.created_at, c.last_message_at, h.name
		FROM conversations c
		JOIN conversation_participants cp ON c.id = cp.conversation_id
		JOIN hubs h ON c.hub_id = h.id
		WHERE cp.user_id = $1
		  AND cp.is_moderator = FALSE
		  AND c.conversation_type = 'mod_mail'
		ORDER BY c.last_message_at DESC
		LIMIT 50
	`

	rows, err := h.pool.Query(c.Request.Context(), query, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get conversations")
		return
	}
	defer rows.Close()

	conversations := []ModMailConversationDetails{}
	for rows.Next() {
		var conv ModMailConversationDetails
		if err := rows.Scan(&conv.ID, &conv.HubID, &conv.Subject, &conv.Status, &conv.CreatedAt, &conv.LastMessageAt, &conv.HubName); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to scan conversation")
			return
		}
		conversations = append(conversations, conv)
	}

	// Enrich all conversations concurrently for better performance
	type enrichResult struct {
		index int
		err   error
	}

	resultsChan := make(chan enrichResult, len(conversations))

	for i := range conversations {
		go func(idx int) {
			err := h.enrichConversationDetails(c.Request.Context(), &conversations[idx], userID)
			resultsChan <- enrichResult{index: idx, err: err}
		}(i)
	}

	// Collect results
	for i := 0; i < len(conversations); i++ {
		result := <-resultsChan
		if result.err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to enrich conversation", "details": result.err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"conversations": conversations,
	})
}

// GetModMailConversation returns a single mod mail conversation.
// @Summary      Get mod mail conversation
// @Tags         ModMail
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /mod-mail/{id} [get]
// GetModMailConversation handles GET /api/v1/mod-mail/:id
// Returns details for a single mod mail conversation
func (h *ModMailHandler) GetModMailConversation(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	// Fetch conversation details
	var conv ModMailConversationDetails
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT c.id, c.hub_id, h.name, c.subject, c.status, c.created_at, c.last_message_at
		FROM conversations c
		JOIN hubs h ON c.hub_id = h.id
		WHERE c.id = $1 AND c.conversation_type = 'mod_mail'
	`, conversationID).Scan(
		&conv.ID,
		&conv.HubID,
		&conv.HubName,
		&conv.Subject,
		&conv.Status,
		&conv.CreatedAt,
		&conv.LastMessageAt,
	)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}

	// Check if user is a participant OR is an admin
	var isParticipant bool
	var isAdmin bool
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT EXISTS(
			SELECT 1 FROM conversation_participants
			WHERE conversation_id = $1 AND user_id = $2
		)
	`, conversationID, userID).Scan(&isParticipant)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check participant status")
		return
	}

	// Check if user is an admin
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT role = 'admin' FROM users WHERE id = $1
	`, userID).Scan(&isAdmin)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check admin status")
		return
	}

	if !isParticipant && !isAdmin {
		RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}

	// Enrich with participants, latest message, and unread count
	if err := h.enrichConversationDetails(c.Request.Context(), &conv, userID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load conversation details")
		return
	}

	c.JSON(http.StatusOK, conv)
}

// UpdateModMailStatus updates the status of a mod mail conversation.
// @Summary      Update mod mail status
// @Tags         ModMail
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int   true  "Conversation ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /mod-mail/{id}/status [patch]
// UpdateModMailStatus handles PATCH /api/v1/mod-mail/:id/status
// Allows moderators to archive or resolve mod mail
func (h *ModMailHandler) UpdateModMailStatus(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	var req struct {
		Status string `json:"status" binding:"required,oneof=open archived resolved"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	// Debug logging
	println("UpdateModMailStatus: conversationID =", conversationID, "status =", req.Status, "userID =", userID)

	// Get conversation to check hub
	var hubID int
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT hub_id FROM conversations WHERE id = $1 AND conversation_type = 'mod_mail'
	`, conversationID).Scan(&hubID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found", "details": err.Error()})
		return
	}

	// Check if user is moderator (or admin)
	isMod, err := permissions.RequireHubModeratorOrAdmin(c, hubID, h.hubModRepo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check moderator status", "details": err.Error()})
		return
	}
	if !isMod {
		RespondError(c, http.StatusForbidden, "Only moderators can update mod mail status")
		return
	}

	// Update status
	// Use explicit type casting to help PostgreSQL infer parameter types correctly
	_, err = h.pool.Exec(c.Request.Context(), `
		UPDATE conversations
		SET status = $1::varchar,
		    archived_at = CASE WHEN $1::varchar = 'archived' OR $1::varchar = 'resolved' THEN NOW() ELSE NULL END,
		    archived_by = CASE WHEN $1::varchar = 'archived' OR $1::varchar = 'resolved' THEN $2::integer ELSE NULL END
		WHERE id = $3
	`, req.Status, userID, conversationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"conversation_id": conversationID,
		"status":          req.Status,
	})
}

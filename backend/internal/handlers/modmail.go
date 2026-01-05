package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
)

// ModMailHandler handles mod mail conversations
type ModMailHandler struct {
	pool             *pgxpool.Pool
	conversationRepo *models.ConversationRepository
	messageRepo      *models.MessageRepository
	userRepo         *models.UserRepository
	hubModRepo       *models.HubModeratorRepository
	hubRepo          *models.HubRepository
}

// NewModMailHandler creates a new mod mail handler
func NewModMailHandler(
	pool *pgxpool.Pool,
	conversationRepo *models.ConversationRepository,
	messageRepo *models.MessageRepository,
	userRepo *models.UserRepository,
	hubModRepo *models.HubModeratorRepository,
	hubRepo *models.HubRepository,
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
	latestMsg, err := h.messageRepo.GetLatestMessage(ctx, conv.ID)
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

// CreateModMail handles POST /api/v1/mod-mail
// Allows any logged-in user to message the mods of a hub
func (h *ModMailHandler) CreateModMail(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req CreateModMailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	if strings.TrimSpace(req.Message) == "" && strings.TrimSpace(req.EncryptedContent) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message content is required"})
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
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	// Begin transaction
	tx, err := h.pool.Begin(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
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
	`, conversationID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add participant"})
		return
	}

	// Get all moderators of the hub
	rows, err := tx.Query(c.Request.Context(), `
		SELECT user_id FROM hub_moderators WHERE hub_id = $1
	`, hub.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get moderators"})
		return
	}
	defer rows.Close()

	moderatorIDs := []int{}
	for rows.Next() {
		var modID int
		if err := rows.Scan(&modID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan moderator"})
			return
		}
		moderatorIDs = append(moderatorIDs, modID)
	}

	// Add all moderators as participants
	for _, modID := range moderatorIDs {
		_, err = tx.Exec(c.Request.Context(), `
			INSERT INTO conversation_participants (conversation_id, user_id, is_moderator, joined_at)
			VALUES ($1, $2, TRUE, NOW())
			ON CONFLICT (conversation_id, user_id) DO NOTHING
		`, conversationID, modID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add moderator"})
			return
		}
	}

	participantIDs := append([]int{userID.(int)}, moderatorIDs...)

	// Validate encryption payloads for multi-recipient encryption
	if req.IsMultiRecipient {
		if req.SharedEncryptionIV == nil || len(req.RecipientKeys) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing encryption payloads for multi-recipient mod mail"})
			return
		}

		for _, pid := range participantIDs {
			if _, ok := req.RecipientKeys[pid]; !ok {
				c.JSON(http.StatusBadRequest, gin.H{
					"error":   "Missing encrypted key for one or more participants",
					"details": "Provide recipient_keys entries for all participants (user and moderators)",
				})
				return
			}
		}
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
	`, conversationID, userID.(int), encryptedContent, req.SenderEncryptedContent, req.EncryptionVersion, isMulti, req.SharedEncryptionIV).Scan(&messageID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create message", "details": err.Error()})
		return
	}

	if isMulti {
		for pid, encryptedKey := range req.RecipientKeys {
			_, err = tx.Exec(c.Request.Context(), `
				INSERT INTO message_recipient_keys (message_id, user_id, encrypted_key)
				VALUES ($1, $2, $3)
			`, messageID, pid, encryptedKey)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store recipient key", "details": err.Error()})
				return
			}
		}
	}

	// Commit transaction
	if err := tx.Commit(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"conversation_id": conversationID,
		"message_id":      messageID,
		"hub_name":        req.HubName,
		"subject":         req.Subject,
	})
}

// GetModMailForHub handles GET /api/v1/mod-mail/hubs/:hub_name
// Returns all mod mail for a hub (moderators only)
func (h *ModMailHandler) GetModMailForHub(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("hub_name")
	status := c.DefaultQuery("status", "open") // open, archived, resolved, all

	// Get hub
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil || hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	// Check if user is a moderator of this hub (or admin)
	userRole, _ := c.Get("user_role")
	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), hub.ID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check permissions"})
		return
	}
	if !isMod && userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can access mod mail"})
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

		// Enrich conversation with participants, latest message, and unread count
		if err := h.enrichConversationDetails(c.Request.Context(), &conv, userID.(int)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to enrich conversation", "details": err.Error()})
			return
		}

		conversations = append(conversations, conv)
	}

	c.JSON(http.StatusOK, gin.H{
		"conversations": conversations,
		"hub_name":      hubName,
		"status":        status,
	})
}

// GetUserModMail handles GET /api/v1/mod-mail/user
// Returns all mod mail conversations the user has created
func (h *ModMailHandler) GetUserModMail(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
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

	rows, err := h.pool.Query(c.Request.Context(), query, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get conversations"})
		return
	}
	defer rows.Close()

	conversations := []ModMailConversationDetails{}
	for rows.Next() {
		var conv ModMailConversationDetails
		if err := rows.Scan(&conv.ID, &conv.HubID, &conv.Subject, &conv.Status, &conv.CreatedAt, &conv.LastMessageAt, &conv.HubName); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan conversation"})
			return
		}

		// Enrich conversation with participants, latest message, and unread count
		if err := h.enrichConversationDetails(c.Request.Context(), &conv, userID.(int)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to enrich conversation", "details": err.Error()})
			return
		}

		conversations = append(conversations, conv)
	}

	c.JSON(http.StatusOK, gin.H{
		"conversations": conversations,
	})
}

// GetModMailConversation handles GET /api/v1/mod-mail/:id
// Returns details for a single mod mail conversation
func (h *ModMailHandler) GetModMailConversation(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
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
		c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
		return
	}

	// Check if user is a participant
	var isParticipant bool
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT EXISTS(
			SELECT 1 FROM conversation_participants
			WHERE conversation_id = $1 AND user_id = $2
		)
	`, conversationID, userID.(int)).Scan(&isParticipant)
	if err != nil || !isParticipant {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant in this conversation"})
		return
	}

	// Enrich with participants, latest message, and unread count
	if err := h.enrichConversationDetails(c.Request.Context(), &conv, userID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load conversation details"})
		return
	}

	c.JSON(http.StatusOK, conv)
}

// UpdateModMailStatus handles PATCH /api/v1/mod-mail/:id/status
// Allows moderators to archive or resolve mod mail
func (h *ModMailHandler) UpdateModMailStatus(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
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
	println("UpdateModMailStatus: conversationID =", conversationID, "status =", req.Status, "userID =", userID.(int))

	// Get conversation to check hub
	var hubID int
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT hub_id FROM conversations WHERE id = $1 AND conversation_type = 'mod_mail'
	`, conversationID).Scan(&hubID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found", "details": err.Error()})
		return
	}

	// Check if user is moderator
	userRole, _ := c.Get("user_role")
	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), hubID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check moderator status", "details": err.Error()})
		return
	}
	if !isMod && userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can update mod mail status"})
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
	`, req.Status, userID.(int), conversationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"conversation_id": conversationID,
		"status":          req.Status,
	})
}

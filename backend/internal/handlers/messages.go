package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/websocket"
)

// MessagesHandler handles HTTP requests for messages
type MessagesHandler struct {
	pool             *pgxpool.Pool
	messageRepo      *models.MessageRepository
	conversationRepo *models.ConversationRepository
	hub              HubInterface
}

// HubInterface defines the methods we need from the WebSocket hub
type HubInterface interface {
	Broadcast(message *websocket.Message)
	IsUserOnline(userID int) bool
}

// NewMessagesHandler creates a new messages handler
func NewMessagesHandler(
	pool *pgxpool.Pool,
	messageRepo *models.MessageRepository,
	conversationRepo *models.ConversationRepository,
	hub HubInterface,
) *MessagesHandler {
	return &MessagesHandler{
		pool:             pool,
		messageRepo:      messageRepo,
		conversationRepo: conversationRepo,
		hub:              hub,
	}
}

// SendMessageRequest represents the request body for sending a message
type SendMessageRequest struct {
	ConversationID           int            `json:"conversation_id" binding:"required"`
	EncryptedContent         string         `json:"encrypted_content,omitempty"` // Base64 encoded encrypted blob
	SenderEncryptedContent   *string        `json:"sender_encrypted_content,omitempty"`
	MessageType              string         `json:"message_type" binding:"required"` // "text", "image", "video", "audio", "file"
	MediaFileID              *int           `json:"media_file_id,omitempty"`         // References media_files table
	MediaURL                 *string        `json:"media_url,omitempty"`
	MediaType                *string        `json:"media_type,omitempty"`
	MediaSize                *int           `json:"media_size,omitempty"`
	EncryptionVersion        string         `json:"encryption_version" binding:"required"` // Default: v1
	MediaEncryptionKey       *string        `json:"media_encryption_key,omitempty"`        // RSA-encrypted AES key (Base64)
	MediaEncryptionIV        *string        `json:"media_encryption_iv,omitempty"`         // AES-GCM IV (Base64)
	SenderMediaEncryptionKey *string        `json:"sender_media_encryption_key,omitempty"`
	IsMultiRecipient         bool           `json:"is_multi_recipient,omitempty"`   // True for multi-recipient messages (mod mail)
	SharedEncryptionIV       *string        `json:"shared_encryption_iv,omitempty"` // Shared IV for multi-recipient messages
	RecipientKeys            map[int]string `json:"recipient_keys,omitempty"`       // Map of user_id -> encrypted_key for multi-recipient
}

// SendMessage handles POST /api/v1/messages
func (h *MessagesHandler) SendMessage(c *gin.Context) {
	// Get user ID from context (set by AuthRequired middleware)
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Validate message type
	validTypes := map[string]bool{"text": true, "image": true, "video": true, "audio": true, "file": true}
	if !validTypes[req.MessageType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message type. Must be: text, image, video, audio, or file"})
		return
	}

	hasMedia := req.MediaFileID != nil
	if !hasMedia && req.MediaURL != nil {
		hasMedia = strings.TrimSpace(*req.MediaURL) != ""
	}

	if strings.TrimSpace(req.EncryptedContent) == "" && !hasMedia {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message content or media is required"})
		return
	}

	// Check conversation type
	var conversationType string
	var err error
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT COALESCE(conversation_type, 'dm') AS conversation_type
		FROM conversations
		WHERE id = $1
	`, req.ConversationID).Scan(&conversationType)
	if err != nil {
		if err.Error() == "no rows in result set" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get conversation", "details": err.Error()})
		}
		return
	}

	var recipientID int

	// For mod_mail conversations, verify participation differently
	if conversationType == "mod_mail" {
		var isParticipant bool
		err = h.pool.QueryRow(c.Request.Context(), `
			SELECT EXISTS(
				SELECT 1 FROM conversation_participants
				WHERE conversation_id = $1 AND user_id = $2
			)
		`, req.ConversationID, userID.(int)).Scan(&isParticipant)
		if err != nil || !isParticipant {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant in this conversation"})
			return
		}
		// For mod mail, we don't target a single recipient; use sender as recipient to satisfy schema
		recipientID = userID.(int)
	} else {
		// For regular conversations, use the existing method
		conversation, err := h.conversationRepo.GetByID(c.Request.Context(), req.ConversationID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get conversation", "details": err.Error()})
			return
		}

		if conversation == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
			return
		}

		if !conversation.IsParticipant(userID.(int)) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant in this conversation"})
			return
		}

		// Determine recipient (the other user in the conversation)
		recipientID = conversation.GetOtherUserID(userID.(int))

		// Check if sender is blocked by recipient
		var isBlocked bool
		blockCheckQuery := `
			SELECT EXISTS(
				SELECT 1 FROM blocked_users
				WHERE blocker_id = $1 AND blocked_id = $2
			)
		`
		err = h.pool.QueryRow(c.Request.Context(), blockCheckQuery, recipientID, userID.(int)).Scan(&isBlocked)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check blocking status"})
			return
		}

		if isBlocked {
			c.JSON(http.StatusForbidden, gin.H{"error": "You cannot send messages to this user"})
			return
		}
	}

	if req.EncryptionVersion == "" {
		if req.IsMultiRecipient {
			req.EncryptionVersion = "v2"
		} else {
			req.EncryptionVersion = "v1"
		}
	}

	// CRITICAL: Mod mail messages MUST be encrypted - reject plaintext
	if conversationType == "mod_mail" {
		if req.EncryptionVersion == "plaintext" || req.EncryptionVersion == "none" || req.EncryptionVersion == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "Mod mail messages must be encrypted",
				"details": "Encryption failed. Ensure all participants have public keys set up.",
			})
			return
		}

		// Mod mail messages using multi-recipient encryption must include payloads
		if req.IsMultiRecipient {
			if len(req.RecipientKeys) == 0 || req.SharedEncryptionIV == nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"error":   "Missing encryption payloads for mod mail message",
					"details": "Provide shared_encryption_iv and recipient_keys for all participants",
				})
				return
			}
		} else {
			// If not multi-recipient, it should still be encrypted (v1 encryption)
			if req.EncryptionVersion != "v1" && req.EncryptionVersion != "v2" {
				c.JSON(http.StatusBadRequest, gin.H{
					"error":   "Mod mail messages must use v1 or v2 encryption",
					"details": "Invalid encryption version for mod mail",
				})
				return
			}
		}
	}

	// IMPORTANT: All messages should be encrypted for security
	// Log a warning if sending plaintext (but allow for backwards compatibility)
	if conversationType == "dm" && (req.EncryptionVersion == "plaintext" || req.EncryptionVersion == "none") {
		// Don't block, but this should be investigated
		c.Writer.Header().Add("X-Warning", "Message sent without encryption. Ensure users have encryption keys set up.")
	}

	// Create message
	message := &models.Message{
		ConversationID:           req.ConversationID,
		SenderID:                 userID.(int),
		RecipientID:              recipientID,
		EncryptedContent:         req.EncryptedContent,
		SenderEncryptedContent:   req.SenderEncryptedContent,
		MessageType:              req.MessageType,
		MediaFileID:              req.MediaFileID,
		MediaURL:                 req.MediaURL,
		MediaType:                req.MediaType,
		MediaSize:                req.MediaSize,
		EncryptionVersion:        req.EncryptionVersion,
		MediaEncryptionKey:       req.MediaEncryptionKey,
		MediaEncryptionIV:        req.MediaEncryptionIV,
		SenderMediaEncryptionKey: req.SenderMediaEncryptionKey,
		IsMultiRecipient:         req.IsMultiRecipient,
		SharedEncryptionIV:       req.SharedEncryptionIV,
		RecipientKeys:            req.RecipientKeys,
	}

	if err := h.messageRepo.Create(c.Request.Context(), message); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message", "details": err.Error()})
		return
	}

	// Reload message to include joined media data (URLs, types, etc.)
	fullMessage, err := h.messageRepo.GetByID(c.Request.Context(), message.ID)
	if err == nil {
		message = fullMessage
	}

	// Update conversation's last_message_at timestamp and re-add users if deleted
	if err := h.conversationRepo.UpdateLastMessageAt(c.Request.Context(), req.ConversationID); err != nil {
		// Log error but don't fail the request
		c.Writer.Header().Add("X-Warning", "Failed to update conversation timestamp")
	}

	// Re-add users to conversation if they had deleted it (for DM conversations only).
	// Do NOT clear archived flags so archived conversations stay archived when new messages arrive.
	if conversationType == "dm" {
		_, _ = h.pool.Exec(c.Request.Context(), `
			UPDATE conversations
			SET deleted_for_user1 = FALSE,
			    deleted_for_user2 = FALSE
			WHERE id = $1 AND conversation_type = 'dm'
		`, req.ConversationID)
	}

	// Broadcast message to recipient via WebSocket if they're online
	if h.hub != nil {
		if h.hub.IsUserOnline(recipientID) {
			// Mark as delivered immediately for online recipient
			_ = h.messageRepo.MarkAsDelivered(c.Request.Context(), message.ID)

			h.hub.Broadcast(&websocket.Message{
				RecipientID: recipientID,
				Type:        "new_message",
				Payload:     message,
			})

			// Notify sender that the message was delivered
			h.hub.Broadcast(&websocket.Message{
				RecipientID: message.SenderID,
				Type:        "message_delivered",
				Payload: gin.H{
					"message_id":      message.ID,
					"conversation_id": message.ConversationID,
				},
			})
		}
	}

	c.JSON(http.StatusCreated, message)
}

// GetMessages handles GET /api/v1/conversations/:id/messages
func (h *MessagesHandler) GetMessages(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	if c.GetBool("shadow_banned") {
		// Silently accept but do not persist
		c.JSON(http.StatusCreated, gin.H{"message": "Message sent", "shadow_banned": true})
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}

	// Check conversation type and verify user is a participant
	var conversationType string
	var hubID *int
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT conversation_type, hub_id FROM conversations WHERE id = $1
	`, conversationID).Scan(&conversationType, &hubID)
	if err != nil {
		if err.Error() == "no rows in result set" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get conversation", "details": err.Error()})
		}
		return
	}

	// For mod_mail conversations, check conversation_participants table
	if conversationType == "mod_mail" {
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
	} else {
		// For regular conversations, use the existing method
		conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get conversation", "details": err.Error()})
			return
		}

		if conversation == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
			return
		}

		if !conversation.IsParticipant(userID.(int)) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant in this conversation"})
			return
		}
	}

	// Parse query parameters
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursorParam := c.Query("cursor")

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 50
	}

	var cursor *timeCursor
	if cursorParam != "" {
		decoded, err := decodeTimeCursor(cursorParam)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cursor"})
			return
		}
		cursor = decoded
	}
	useCursorPagination := cursorParam != "" || offset == 0
	limitArg := limit
	if useCursorPagination {
		limitArg = limit + 1
		offset = 0
	}

	var messages []*models.Message

	// For mod mail, return all messages for the conversation (all participants can view)
	if conversationType == "mod_mail" {
		if useCursorPagination {
			var payload *models.TimeCursor
			if cursor != nil {
				payload = &models.TimeCursor{ID: cursor.ID, Timestamp: cursor.Timestamp}
			}
			messages, err = h.messageRepo.GetByConversationIDForAllWithCursor(c.Request.Context(), conversationID, limitArg, payload)
		} else {
			messages, err = h.messageRepo.GetByConversationIDForAll(c.Request.Context(), conversationID, limitArg, offset)
		}
	} else {
		if useCursorPagination {
			var payload *models.TimeCursor
			if cursor != nil {
				payload = &models.TimeCursor{ID: cursor.ID, Timestamp: cursor.Timestamp}
			}
			messages, err = h.messageRepo.GetByConversationIDWithCursor(c.Request.Context(), conversationID, userID.(int), limitArg, payload)
		} else {
			messages, err = h.messageRepo.GetByConversationID(c.Request.Context(), conversationID, userID.(int), limitArg, offset)
		}
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get messages", "details": err.Error()})
		return
	}

	// Mark undelivered messages as delivered for this recipient and notify senders
	if h.hub != nil {
		delivered, err := h.messageRepo.MarkUndeliveredAsDelivered(c.Request.Context(), conversationID, userID.(int))
		if err == nil {
			for _, dm := range delivered {
				h.hub.Broadcast(&websocket.Message{
					RecipientID: dm.SenderID,
					Type:        "message_delivered",
					Payload: gin.H{
						"message_id":      dm.ID,
						"conversation_id": conversationID,
					},
				})
			}
		}
	}

	nextCursor := ""
	if useCursorPagination && len(messages) > limit {
		messages = messages[:limit]
		if len(messages) > 0 {
			last := messages[len(messages)-1]
			nextCursor = encodeTimeCursor(timeCursor{ID: last.ID, Timestamp: last.SentAt})
		}
	}

	response := gin.H{
		"messages": messages,
		"limit":    limit,
		"offset":   offset,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
}

// MarkAsRead handles POST /api/v1/conversations/:id/read
func (h *MessagesHandler) MarkAsRead(c *gin.Context) {
	// Get user ID from context
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

	// Check conversation type first
	var conversationType string
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT COALESCE(conversation_type, 'dm') AS conversation_type
		FROM conversations
		WHERE id = $1
	`, conversationID).Scan(&conversationType)

	if err != nil {
		if err.Error() == "no rows in result set" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get conversation", "details": err.Error()})
		}
		return
	}

	// Verify user is a participant based on conversation type
	if conversationType == "mod_mail" {
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
	} else {
		// For DM conversations, use the traditional method
		conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get conversation", "details": err.Error()})
			return
		}
		if conversation == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
			return
		}
		if !conversation.IsParticipant(userID.(int)) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant in this conversation"})
			return
		}
	}

	// Get all unread messages before marking as read, so we can send individual events
	query := `
		SELECT id, sender_id
		FROM messages
		WHERE conversation_id = $1
		  AND recipient_id = $2
		  AND read_at IS NULL
		  AND deleted_for_recipient = false
	`
	rows, err := h.pool.Query(c.Request.Context(), query, conversationID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get unread messages", "details": err.Error()})
		return
	}
	defer rows.Close()

	var unreadMessages []struct {
		ID       int
		SenderID int
	}
	for rows.Next() {
		var msg struct {
			ID       int
			SenderID int
		}
		if err := rows.Scan(&msg.ID, &msg.SenderID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan messages", "details": err.Error()})
			return
		}
		unreadMessages = append(unreadMessages, msg)
	}

	// Mark all messages as read for this user
	if err := h.messageRepo.MarkAllAsRead(c.Request.Context(), conversationID, userID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark messages as read", "details": err.Error()})
		return
	}

	// Notify senders about individual message read events
	if h.hub != nil {
		for _, msg := range unreadMessages {
			h.hub.Broadcast(&websocket.Message{
				RecipientID: msg.SenderID,
				Type:        "message_read",
				Payload: gin.H{
					"message_id":      msg.ID,
					"conversation_id": conversationID,
					"reader_id":       userID.(int),
				},
			})
		}

		// Notify other participants based on conversation type
		if conversationType == "mod_mail" {
			// For mod mail, notify all participants except the reader
			rows, err := h.pool.Query(c.Request.Context(), `
				SELECT user_id FROM conversation_participants
				WHERE conversation_id = $1 AND user_id != $2
			`, conversationID, userID.(int))
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var participantID int
					if rows.Scan(&participantID) == nil {
						h.hub.Broadcast(&websocket.Message{
							RecipientID: participantID,
							Type:        "conversation_read",
							Payload: gin.H{
								"conversation_id": conversationID,
								"reader_id":       userID.(int),
							},
						})
					}
				}
			}
		} else {
			// For DM conversations, notify the other participant
			conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
			if err == nil && conversation != nil {
				otherUserID := conversation.GetOtherUserID(userID.(int))
				if otherUserID != 0 {
					h.hub.Broadcast(&websocket.Message{
						RecipientID: otherUserID,
						Type:        "conversation_read",
						Payload: gin.H{
							"conversation_id": conversationID,
							"reader_id":       userID.(int),
						},
					})
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Messages marked as read"})
}

// MarkSingleMessageAsRead handles POST /api/v1/messages/:id/read
func (h *MessagesHandler) MarkSingleMessageAsRead(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	// Get message to verify user is the recipient
	message, err := h.messageRepo.GetByID(c.Request.Context(), messageID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get message", "details": err.Error()})
		return
	}

	if message == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
		return
	}

	// Only the recipient can mark a message as read
	if message.RecipientID != userID.(int) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only mark your own received messages as read"})
		return
	}

	// Check if already read
	if message.ReadAt != nil {
		c.JSON(http.StatusOK, gin.H{"message": "Message already marked as read"})
		return
	}

	// Mark message as read
	if err := h.messageRepo.MarkAsRead(c.Request.Context(), messageID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark message as read", "details": err.Error()})
		return
	}

	// Notify sender via WebSocket
	if h.hub != nil {
		h.hub.Broadcast(&websocket.Message{
			RecipientID: message.SenderID,
			Type:        "message_read",
			Payload: gin.H{
				"message_id":      messageID,
				"conversation_id": message.ConversationID,
				"reader_id":       userID.(int),
			},
		})
	}

	c.JSON(http.StatusOK, gin.H{"message": "Message marked as read"})
}

// DeleteMessage handles DELETE /api/v1/messages/:id
func (h *MessagesHandler) DeleteMessage(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	deleteScope := strings.ToLower(strings.TrimSpace(c.DefaultQuery("delete_for", "self")))
	if deleteScope == "" {
		deleteScope = "self"
	}
	if deleteScope != "self" && deleteScope != "both" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid delete_for value. Must be 'self' or 'both'"})
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	// Get message to verify user is a participant
	message, err := h.messageRepo.GetByID(c.Request.Context(), messageID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get message", "details": err.Error()})
		return
	}

	if message == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
		return
	}

	if !message.IsParticipant(userID.(int)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant in this message"})
		return
	}

	if deleteScope == "both" {
		if message.SenderID != userID.(int) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Only the message sender can delete for both users"})
			return
		}

		if err := h.messageRepo.SoftDeleteForBoth(c.Request.Context(), messageID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message for both users", "details": err.Error()})
			return
		}
	} else {
		// Soft delete for this user
		if err := h.messageRepo.SoftDeleteForUser(c.Request.Context(), messageID, userID.(int)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message", "details": err.Error()})
			return
		}
	}

	// Attempt hard delete if both users have deleted
	// (This will silently fail if not both deleted, which is fine)
	_ = h.messageRepo.HardDelete(c.Request.Context(), messageID)

	if deleteScope == "both" {
		c.JSON(http.StatusOK, gin.H{"message": "Message deleted for both users"})
	} else {
		c.JSON(http.StatusOK, gin.H{"message": "Message deleted successfully"})
	}
}

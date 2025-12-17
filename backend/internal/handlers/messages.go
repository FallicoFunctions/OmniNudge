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
	ConversationID    int     `json:"conversation_id" binding:"required"`
	EncryptedContent  string  `json:"encrypted_content,omitempty"`     // Base64 encoded encrypted blob
	MessageType       string  `json:"message_type" binding:"required"` // "text", "image", "video", "audio", "file"
	MediaFileID       *int    `json:"media_file_id,omitempty"`         // References media_files table
	MediaURL          *string `json:"media_url,omitempty"`
	MediaType         *string `json:"media_type,omitempty"`
	MediaSize         *int    `json:"media_size,omitempty"`
	EncryptionVersion string  `json:"encryption_version" binding:"required"` // Default: v1
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

	if req.EncryptionVersion == "" {
		req.EncryptionVersion = "v1"
	}

	// Verify conversation exists and user is a participant
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
	recipientID := conversation.GetOtherUserID(userID.(int))

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

	// Create message
	message := &models.Message{
		ConversationID:    req.ConversationID,
		SenderID:          userID.(int),
		RecipientID:       recipientID,
		EncryptedContent:  req.EncryptedContent,
		MessageType:       req.MessageType,
		MediaFileID:       req.MediaFileID,
		MediaURL:          req.MediaURL,
		MediaType:         req.MediaType,
		MediaSize:         req.MediaSize,
		EncryptionVersion: req.EncryptionVersion,
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

	// Update conversation's last_message_at timestamp
	if err := h.conversationRepo.UpdateLastMessageAt(c.Request.Context(), req.ConversationID); err != nil {
		// Log error but don't fail the request
		c.Writer.Header().Add("X-Warning", "Failed to update conversation timestamp")
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

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}

	// Verify conversation exists and user is a participant
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

	// Parse query parameters
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 50
	}

	messages, err := h.messageRepo.GetByConversationID(c.Request.Context(), conversationID, userID.(int), limit, offset)
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

	c.JSON(http.StatusOK, gin.H{
		"messages": messages,
		"limit":    limit,
		"offset":   offset,
	})
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

	// Verify conversation exists and user is a participant
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

		// Also notify the other participant that the conversation was read
		otherUserID := conversation.GetOtherUserID(userID.(int))
		h.hub.Broadcast(&websocket.Message{
			RecipientID: otherUserID,
			Type:        "conversation_read",
			Payload: gin.H{
				"conversation_id": conversationID,
				"reader_id":       userID.(int),
			},
		})
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

	// Soft delete for this user
	if err := h.messageRepo.SoftDeleteForUser(c.Request.Context(), messageID, userID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message", "details": err.Error()})
		return
	}

	// Attempt hard delete if both users have deleted
	// (This will silently fail if not both deleted, which is fine)
	_ = h.messageRepo.HardDelete(c.Request.Context(), messageID)

	c.JSON(http.StatusOK, gin.H{"message": "Message deleted successfully"})
}

package handlers

import (
	"net/http"
	"strconv"

	"github.com/chatreddit/backend/internal/models"
	"github.com/chatreddit/backend/internal/websocket"
	"github.com/gin-gonic/gin"
)

// MessagesHandler handles HTTP requests for messages
type MessagesHandler struct {
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
	messageRepo *models.MessageRepository,
	conversationRepo *models.ConversationRepository,
	hub HubInterface,
) *MessagesHandler {
	return &MessagesHandler{
		messageRepo:      messageRepo,
		conversationRepo: conversationRepo,
		hub:              hub,
	}
}

// SendMessageRequest represents the request body for sending a message
type SendMessageRequest struct {
	ConversationID    int     `json:"conversation_id" binding:"required"`
	EncryptedContent  string  `json:"encrypted_content" binding:"required"` // Base64 encoded encrypted blob
	MessageType       string  `json:"message_type" binding:"required"`      // "text", "image", "video", "audio"
	MediaURL          *string `json:"media_url,omitempty"`
	MediaType         *string `json:"media_type,omitempty"`
	MediaSize         *int    `json:"media_size,omitempty"`
	EncryptionVersion int     `json:"encryption_version" binding:"required"` // Default: 1
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
	validTypes := map[string]bool{"text": true, "image": true, "video": true, "audio": true}
	if !validTypes[req.MessageType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message type. Must be: text, image, video, or audio"})
		return
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

	// Create message
	message := &models.Message{
		ConversationID:    req.ConversationID,
		SenderID:          userID.(int),
		RecipientID:       recipientID,
		EncryptedContent:  req.EncryptedContent,
		MessageType:       req.MessageType,
		MediaURL:          req.MediaURL,
		MediaType:         req.MediaType,
		MediaSize:         req.MediaSize,
		EncryptionVersion: req.EncryptionVersion,
	}

	if err := h.messageRepo.Create(c.Request.Context(), message); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message", "details": err.Error()})
		return
	}

	// Update conversation's last_message_at timestamp
	if err := h.conversationRepo.UpdateLastMessageAt(c.Request.Context(), req.ConversationID); err != nil {
		// Log error but don't fail the request
		c.Writer.Header().Add("X-Warning", "Failed to update conversation timestamp")
	}

	// Broadcast message to recipient via WebSocket if they're online
	if h.hub != nil && h.hub.IsUserOnline(recipientID) {
		h.hub.Broadcast(&websocket.Message{
			RecipientID: recipientID,
			Type:        "new_message",
			Payload:     message,
		})
	}

	c.JSON(http.StatusCreated, message)
}

// GetMessages handles GET /api/v1/conversations/:conversationId/messages
func (h *MessagesHandler) GetMessages(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	conversationID, err := strconv.Atoi(c.Param("conversationId"))
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

	c.JSON(http.StatusOK, gin.H{
		"messages": messages,
		"limit":    limit,
		"offset":   offset,
	})
}

// MarkAsRead handles POST /api/v1/conversations/:conversationId/read
func (h *MessagesHandler) MarkAsRead(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	conversationID, err := strconv.Atoi(c.Param("conversationId"))
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

	// Mark all messages as read for this user
	if err := h.messageRepo.MarkAllAsRead(c.Request.Context(), conversationID, userID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark messages as read", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Messages marked as read"})
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

package handlers

import (
	"net/http"
	"strconv"

	"github.com/omninudge/backend/internal/models"
	"github.com/gin-gonic/gin"
)

// ConversationsHandler handles HTTP requests for conversations
type ConversationsHandler struct {
	conversationRepo *models.ConversationRepository
	messageRepo      *models.MessageRepository
	userRepo         *models.UserRepository
}

// NewConversationsHandler creates a new conversations handler
func NewConversationsHandler(
	conversationRepo *models.ConversationRepository,
	messageRepo *models.MessageRepository,
	userRepo *models.UserRepository,
) *ConversationsHandler {
	return &ConversationsHandler{
		conversationRepo: conversationRepo,
		messageRepo:      messageRepo,
		userRepo:         userRepo,
	}
}

// CreateConversationRequest represents the request body for creating a conversation
type CreateConversationRequest struct {
	OtherUserID int `json:"other_user_id" binding:"required"`
}

// ConversationWithDetails includes conversation info plus latest message and unread count
type ConversationWithDetails struct {
	*models.Conversation
	OtherUser     *models.User    `json:"other_user"`
	LatestMessage *models.Message `json:"latest_message,omitempty"`
	UnreadCount   int             `json:"unread_count"`
}

// CreateConversation handles POST /api/v1/conversations
func (h *ConversationsHandler) CreateConversation(c *gin.Context) {
	// Get user ID from context (set by AuthRequired middleware)
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req CreateConversationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Validate that user is not trying to message themselves
	if req.OtherUserID == userID.(int) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot create conversation with yourself"})
		return
	}

	// Verify other user exists
	otherUser, err := h.userRepo.GetByID(c.Request.Context(), req.OtherUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user", "details": err.Error()})
		return
	}
	if otherUser == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Create or get existing conversation
	conversation, err := h.conversationRepo.Create(c.Request.Context(), userID.(int), req.OtherUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create conversation", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, conversation)
}

// GetConversations handles GET /api/v1/conversations
func (h *ConversationsHandler) GetConversations(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse query parameters
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 20
	}

	conversations, err := h.conversationRepo.GetByUserID(c.Request.Context(), userID.(int), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get conversations", "details": err.Error()})
		return
	}

	// Enrich conversations with other user info, latest message, and unread count
	var enriched []*ConversationWithDetails
	for _, conv := range conversations {
		details := &ConversationWithDetails{
			Conversation: conv,
		}

		// Get other user info
		otherUserID := conv.GetOtherUserID(userID.(int))
		otherUser, err := h.userRepo.GetByID(c.Request.Context(), otherUserID)
		if err == nil && otherUser != nil {
			details.OtherUser = otherUser
		}

		// Get latest message
		latestMsg, err := h.messageRepo.GetLatestMessage(c.Request.Context(), conv.ID)
		if err == nil && latestMsg != nil {
			details.LatestMessage = latestMsg
		}

		// Get unread count
		unreadCount, err := h.messageRepo.GetUnreadCount(c.Request.Context(), conv.ID, userID.(int))
		if err == nil {
			details.UnreadCount = unreadCount
		}

		enriched = append(enriched, details)
	}

	c.JSON(http.StatusOK, gin.H{
		"conversations": enriched,
		"limit":         limit,
		"offset":        offset,
	})
}

// GetConversation handles GET /api/v1/conversations/:id
func (h *ConversationsHandler) GetConversation(c *gin.Context) {
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

	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get conversation", "details": err.Error()})
		return
	}

	if conversation == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
		return
	}

	// Verify user is a participant
	if !conversation.IsParticipant(userID.(int)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant in this conversation"})
		return
	}

	// Enrich with other user info
	details := &ConversationWithDetails{
		Conversation: conversation,
	}

	otherUserID := conversation.GetOtherUserID(userID.(int))
	otherUser, err := h.userRepo.GetByID(c.Request.Context(), otherUserID)
	if err == nil && otherUser != nil {
		details.OtherUser = otherUser
	}

	// Get latest message
	latestMsg, err := h.messageRepo.GetLatestMessage(c.Request.Context(), conversation.ID)
	if err == nil && latestMsg != nil {
		details.LatestMessage = latestMsg
	}

	// Get unread count
	unreadCount, err := h.messageRepo.GetUnreadCount(c.Request.Context(), conversation.ID, userID.(int))
	if err == nil {
		details.UnreadCount = unreadCount
	}

	c.JSON(http.StatusOK, details)
}

// DeleteConversation handles DELETE /api/v1/conversations/:id
func (h *ConversationsHandler) DeleteConversation(c *gin.Context) {
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

	// Delete the conversation and all messages
	if err := h.conversationRepo.Delete(c.Request.Context(), conversationID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete conversation", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Conversation deleted successfully"})
}

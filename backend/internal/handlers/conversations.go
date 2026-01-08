package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
)

// ConversationsHandler handles HTTP requests for conversations
type ConversationsHandler struct {
	pool             *pgxpool.Pool
	conversationRepo *models.ConversationRepository
	messageRepo      *models.MessageRepository
	userRepo         *models.UserRepository
}

// NewConversationsHandler creates a new conversations handler
func NewConversationsHandler(
	pool *pgxpool.Pool,
	conversationRepo *models.ConversationRepository,
	messageRepo *models.MessageRepository,
	userRepo *models.UserRepository,
) *ConversationsHandler {
	return &ConversationsHandler{
		pool:             pool,
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
	OtherUser     *models.User    `json:"other_user,omitempty"`
	HubName       *string         `json:"hub_name,omitempty"`
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
	includeArchived := c.DefaultQuery("include_archived", "false") == "true"

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 20
	}

	conversations, err := h.conversationRepo.GetByUserID(c.Request.Context(), userID.(int), limit, offset, includeArchived)
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

		// Get other user info (only for DM conversations)
		if conv.ConversationType == "dm" {
			otherUserID := conv.GetOtherUserID(userID.(int))
			if otherUserID != 0 {
				otherUser, err := h.userRepo.GetByID(c.Request.Context(), otherUserID)
				if err == nil && otherUser != nil {
					details.OtherUser = otherUser
				}
			}
		} else if conv.ConversationType == "mod_mail" && conv.HubID != nil {
			// For mod_mail, get hub name
			var hubName string
			err := h.pool.QueryRow(c.Request.Context(), `SELECT name FROM hubs WHERE id = $1`, *conv.HubID).Scan(&hubName)
			if err == nil {
				details.HubName = &hubName
			}
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

		// For DMs: compute per-user archived_at based on archived_for_user1/user2
		// This ensures the frontend can filter correctly based on archived_at
		if conv.ConversationType == "dm" {
			var archivedForUser1, archivedForUser2 bool
			err := h.pool.QueryRow(c.Request.Context(), `
				SELECT COALESCE(archived_for_user1, false), COALESCE(archived_for_user2, false)
				FROM conversations WHERE id = $1
			`, conv.ID).Scan(&archivedForUser1, &archivedForUser2)
			if err == nil {
				// Legacy fallback: if conversation-level archived_at is set, treat as archived for both users
				legacyArchived := conv.ArchivedAt != nil

				// If this conversation is archived for the current user, set archived_at
				// Otherwise, clear it
				if (conv.User1ID != nil && *conv.User1ID == userID.(int) && archivedForUser1) ||
					(conv.User2ID != nil && *conv.User2ID == userID.(int) && archivedForUser2) ||
					legacyArchived {
					// Keep the existing archived_at if set, otherwise use current time as a placeholder
					if details.ArchivedAt == nil {
						now := time.Now()
						details.ArchivedAt = &now
					}
				} else {
					// Not archived for this user
					details.ArchivedAt = nil
				}
			}
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

	// Determine conversation type first
	var conversationType string
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT COALESCE(conversation_type, 'dm') AS conversation_type
		FROM conversations
		WHERE id = $1
	`, conversationID).Scan(&conversationType)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
		return
	}

	// Special handling for mod_mail threads (no user1/user2)
	if conversationType == "mod_mail" {
		// Verify participation via conversation_participants
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

		// Fetch basics to populate timestamps
		var createdAt, lastMessageAt time.Time
		err = h.pool.QueryRow(c.Request.Context(), `
			SELECT created_at, last_message_at FROM conversations WHERE id = $1
		`, conversationID).Scan(&createdAt, &lastMessageAt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load conversation", "details": err.Error()})
			return
		}

		uid := userID.(int)
		conv := &models.Conversation{
			ID:               conversationID,
			User1ID:          &uid, // placeholder to pass IsParticipant checks elsewhere if needed
			User2ID:          &uid,
			CreatedAt:        createdAt,
			LastMessageAt:    lastMessageAt,
			ConversationType: "dm", // Assume DM if we're creating it this way
		}
		details := &ConversationWithDetails{Conversation: conv}

		// Latest message
		latestMsg, _ := h.messageRepo.GetLatestMessage(c.Request.Context(), conversationID)
		if latestMsg != nil {
			details.LatestMessage = latestMsg
		}
		// Unread count
		if unreadCount, err := h.messageRepo.GetUnreadCount(c.Request.Context(), conversationID, userID.(int)); err == nil {
			details.UnreadCount = unreadCount
		}

		c.JSON(http.StatusOK, details)
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

	// Get delete scope from query parameter
	deleteFor := strings.ToLower(strings.TrimSpace(c.DefaultQuery("delete_for", "me")))
	if deleteFor != "me" && deleteFor != "both" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid delete_for value. Must be 'me' or 'both'"})
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

	if deleteFor == "both" {
		// Hard delete all user's messages
		if err := h.conversationRepo.HardDeleteMessages(c.Request.Context(), conversationID, userID.(int)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete messages", "details": err.Error()})
			return
		}
	}

	// Soft delete conversation for this user
	if err := h.conversationRepo.SoftDeleteForUser(c.Request.Context(), conversationID, userID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete conversation", "details": err.Error()})
		return
	}

	// Attempt to hard delete if both users have deleted
	_ = h.conversationRepo.HardDeleteIfBothDeleted(c.Request.Context(), conversationID)

	if deleteFor == "both" {
		c.JSON(http.StatusOK, gin.H{"message": "Conversation and your messages deleted successfully"})
	} else {
		c.JSON(http.StatusOK, gin.H{"message": "Conversation deleted successfully"})
	}
}

// ArchiveConversation handles PUT /api/v1/conversations/:id/archive
func (h *ConversationsHandler) ArchiveConversation(c *gin.Context) {
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

	// Check permissions based on conversation type
	if conversation.ConversationType == "dm" {
		if !conversation.IsParticipant(userID.(int)) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant in this conversation"})
			return
		}
	} else if conversation.ConversationType == "mod_mail" {
		// For mod mail, check if user is a participant in conversation_participants table
		var count int
		err := h.pool.QueryRow(c.Request.Context(), `
			SELECT COUNT(*) FROM conversation_participants
			WHERE conversation_id = $1 AND user_id = $2
		`, conversationID, userID.(int)).Scan(&count)
		if err != nil || count == 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant in this mod mail conversation"})
			return
		}
	}

	// Archive the conversation
	if err := h.conversationRepo.Archive(c.Request.Context(), conversationID, userID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to archive conversation", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Conversation archived successfully"})
}

// UnarchiveConversation handles PUT /api/v1/conversations/:id/unarchive
func (h *ConversationsHandler) UnarchiveConversation(c *gin.Context) {
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

	// Unarchive the conversation (permission check is done in the repository method)
	if err := h.conversationRepo.Unarchive(c.Request.Context(), conversationID, userID.(int)); err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant in this conversation or conversation is not archived"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unarchive conversation", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Conversation unarchived successfully"})
}

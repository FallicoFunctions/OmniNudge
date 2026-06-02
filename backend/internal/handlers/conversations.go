package handlers

import (
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/services"
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
	conversationRepo ports.ConversationRepository
	messageRepo      ports.MessageRepository
	userRepo         ports.UserRepository
	autoDeleteSvc    *services.AutoDeleteService
}

// NewConversationsHandler creates a new conversations handler
func NewConversationsHandler(
	pool *pgxpool.Pool,
	conversationRepo ports.ConversationRepository,
	messageRepo ports.MessageRepository,
	userRepo ports.UserRepository,
	autoDeleteSvc *services.AutoDeleteService,
) *ConversationsHandler {
	return &ConversationsHandler{
		pool:             pool,
		conversationRepo: conversationRepo,
		messageRepo:      messageRepo,
		userRepo:         userRepo,
		autoDeleteSvc:    autoDeleteSvc,
	}
}

// CreateConversationRequest represents the request body for creating a conversation
type CreateConversationRequest struct {
	OtherUserID int `json:"other_user_id" binding:"required"`
}

type ArchiveBatchRequest struct {
	ConversationIDs []int `json:"conversation_ids" binding:"required"`
}

// ConversationWithDetails includes conversation info plus latest message and unread count
type ConversationWithDetails struct {
	*models.Conversation
	OtherUser     *ConversationUser `json:"other_user,omitempty"`
	HubName       *string           `json:"hub_name,omitempty"`
	LatestMessage *models.Message   `json:"latest_message,omitempty"`
	UnreadCount   int               `json:"unread_count"`
	IsArchived    bool              `json:"is_archived"`
}

// ConversationUser exposes a safe subset of user fields for conversation listings.
// Intentionally excludes presence/last_seen and any sensitive profile/account fields.
type ConversationUser struct {
	ID        int     `json:"id"`
	Username  string  `json:"username"`
	AvatarURL *string `json:"avatar_url,omitempty"`
	Bio       *string `json:"bio,omitempty"`
	Karma     int     `json:"karma"`
}

func (h *ConversationsHandler) ensureConversationParticipant(c *gin.Context, conversationID int, userID int) (*models.Conversation, bool) {
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get conversation")
		return nil, false
	}
	if conversation == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return nil, false
	}

	switch conversation.ConversationType {
	case "dm", "":
		if !conversation.IsParticipant(userID) {
			RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
			return nil, false
		}
	case "group", "mod_mail":
		var count int
		err := h.pool.QueryRow(c.Request.Context(), `
			SELECT COUNT(*) FROM conversation_participants
			WHERE conversation_id = $1 AND user_id = $2
		`, conversationID, userID).Scan(&count)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to verify conversation participant")
			return nil, false
		}
		if count == 0 {
			RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
			return nil, false
		}
	default:
		RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return nil, false
	}

	return conversation, true
}

// CreateConversation creates a new direct conversation.
// @Summary      Create conversation
// @Tags         Conversations
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      201  {object}  models.Conversation
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations [post]
func (h *ConversationsHandler) CreateConversation(c *gin.Context) {
	// Get user ID from context (set by AuthRequired middleware)
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req CreateConversationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate that user is not trying to message themselves
	if req.OtherUserID == userID {
		RespondError(c, http.StatusBadRequest, "Cannot create conversation with yourself")
		return
	}

	// Verify other user exists
	otherUser, err := h.userRepo.GetByID(c.Request.Context(), req.OtherUserID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get user")
		return
	}
	if otherUser == nil || isPendingDeletionHiddenFromViewer(otherUser, userID) {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	// Prevent creating DMs when either side has blocked the other.
	var blockedByEither bool
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT EXISTS (
			SELECT 1
			FROM blocked_users
			WHERE (blocker_id = $1 AND blocked_id = $2)
			   OR (blocker_id = $2 AND blocked_id = $1)
		)
	`, userID, req.OtherUserID).Scan(&blockedByEither)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
		return
	}
	if blockedByEither {
		RespondError(c, http.StatusForbidden, blockingSettingsErrorMessage)
		return
	}

	// Create or get existing conversation
	conversation, err := h.conversationRepo.Create(c.Request.Context(), userID, req.OtherUserID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create conversation")
		return
	}

	c.JSON(http.StatusCreated, conversation)
}

// GetConversations returns conversations for the current user.
// @Summary      Get conversations
// @Tags         Conversations
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations [get]
func (h *ConversationsHandler) GetConversations(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	// Parse query parameters
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	includeArchived := c.DefaultQuery("include_archived", "false") == "true"
	archivedOnly := c.DefaultQuery("archived_only", "false") == "true"
	cursorParam := c.Query("cursor")
	if archivedOnly {
		includeArchived = true
	}

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 20
	}

	var cursor *timeCursor
	if cursorParam != "" {
		decoded, err := decodeTimeCursor(cursorParam)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
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

	var conversations []*models.Conversation
	var err error
	if useCursorPagination {
		var payload *models.TimeCursor
		if cursor != nil {
			payload = &models.TimeCursor{ID: cursor.ID, Timestamp: cursor.Timestamp}
		}
		if archivedOnly {
			conversations, err = h.conversationRepo.GetArchivedByUserIDWithCursor(c.Request.Context(), userID, limitArg, payload)
		} else {
			conversations, err = h.conversationRepo.GetByUserIDWithCursor(c.Request.Context(), userID, limitArg, includeArchived, payload)
		}
	} else {
		if archivedOnly {
			conversations, err = h.conversationRepo.GetArchivedByUserID(c.Request.Context(), userID, limitArg, offset)
		} else {
			conversations, err = h.conversationRepo.GetByUserID(c.Request.Context(), userID, limitArg, offset, includeArchived)
		}
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get conversations")
		return
	}

	// Enrich conversations with other user info, latest message, and unread count concurrently
	enriched := make([]*ConversationWithDetails, len(conversations))
	ctx := c.Request.Context()

	type enrichResult struct {
		index int
		err   error
	}

	resultsChan := make(chan enrichResult, len(conversations))

	// Enrich all conversations concurrently for better performance
	for i, conv := range conversations {
		go func(idx int, conversation *models.Conversation) {
			details := &ConversationWithDetails{
				Conversation: conversation,
				IsArchived:   conversation.ArchivedAt != nil,
			}

			// Get other user info (only for DM conversations)
			if conversation.ConversationType == "dm" {
				otherUserID := conversation.GetOtherUserID(userID)
				if otherUserID != 0 {
					otherUser, err := h.userRepo.GetByID(ctx, otherUserID)
					if err == nil && otherUser != nil {
						if isPendingDeletionHiddenFromViewer(otherUser, userID) {
							enriched[idx] = nil
							resultsChan <- enrichResult{index: idx, err: nil}
							return
						}
						details.OtherUser = &ConversationUser{
							ID:        otherUser.ID,
							Username:  otherUser.Username,
							AvatarURL: otherUser.AvatarURL,
							Bio:       otherUser.Bio,
							Karma:     otherUser.Karma,
						}
					}
				}
			} else if conversation.ConversationType == "mod_mail" && conversation.HubID != nil {
				// For mod_mail, get hub name
				var hubName string
				err := h.pool.QueryRow(ctx, `SELECT name FROM hubs WHERE id = $1`, *conversation.HubID).Scan(&hubName)
				if err == nil {
					details.HubName = &hubName
				}
			}

			// Get latest message
			latestMsg, err := h.messageRepo.GetLatestMessage(ctx, conversation.ID, userID)
			if err == nil && latestMsg != nil {
				details.LatestMessage = latestMsg
			}

			// Get unread count
			unreadCount, err := h.messageRepo.GetUnreadCount(ctx, conversation.ID, userID)
			if err == nil {
				details.UnreadCount = unreadCount
			}

			// For DMs (including legacy rows with empty conversation_type): compute per-user archive state.
			if conversation.ConversationType == "dm" || conversation.ConversationType == "" {
				var archivedForUser1, archivedForUser2 bool
				err := h.pool.QueryRow(ctx, `
					SELECT COALESCE(archived_for_user1, false), COALESCE(archived_for_user2, false)
					FROM conversations WHERE id = $1
				`, conversation.ID).Scan(&archivedForUser1, &archivedForUser2)
				if err == nil {
					legacyArchived := conversation.ArchivedAt != nil
					details.IsArchived = (conversation.User1ID != nil && *conversation.User1ID == userID && archivedForUser1) ||
						(conversation.User2ID != nil && *conversation.User2ID == userID && archivedForUser2) ||
						legacyArchived
				}
			}

			enriched[idx] = details
			resultsChan <- enrichResult{index: idx, err: nil}
		}(i, conv)
	}

	// Wait for all enrichment to complete
	for i := 0; i < len(conversations); i++ {
		<-resultsChan
	}

	filtered := enriched[:0]
	for _, details := range enriched {
		if details != nil {
			filtered = append(filtered, details)
		}
	}
	enriched = filtered

	nextCursor := ""
	if useCursorPagination && len(enriched) > limit {
		enriched = enriched[:limit]
		if len(enriched) > 0 {
			last := enriched[len(enriched)-1]
			nextCursor = encodeTimeCursor(timeCursor{ID: last.ID, Timestamp: last.LastMessageAt})
		}
	}

	response := gin.H{
		"conversations": enriched,
		"limit":         limit,
		"offset":        offset,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
}

// GetArchivedConversations returns archived conversations.
// @Summary      Get archived conversations
// @Tags         Conversations
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/archived [get]
func (h *ConversationsHandler) GetArchivedConversations(c *gin.Context) {
	query := c.Request.URL.Query()
	query.Set("include_archived", "true")
	query.Set("archived_only", "true")
	c.Request.URL.RawQuery = query.Encode()
	h.GetConversations(c)
}

// GetConversation returns a single conversation by ID.
// @Summary      Get conversation
// @Tags         Conversations
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  models.Conversation
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id} [get]
func (h *ConversationsHandler) GetConversation(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
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
		RespondError(c, http.StatusNotFound, "Conversation not found")
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
		`, conversationID, userID).Scan(&isParticipant)
		if err != nil || !isParticipant {
			RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
			return
		}

		// Fetch basics to populate timestamps
		var createdAt, lastMessageAt time.Time
		err = h.pool.QueryRow(c.Request.Context(), `
			SELECT created_at, last_message_at FROM conversations WHERE id = $1
		`, conversationID).Scan(&createdAt, &lastMessageAt)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to load conversation")
			return
		}

		uid := userID
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
		latestMsg, _ := h.messageRepo.GetLatestMessage(c.Request.Context(), conversationID, userID)
		if latestMsg != nil {
			details.LatestMessage = latestMsg
		}
		// Unread count
		if unreadCount, err := h.messageRepo.GetUnreadCount(c.Request.Context(), conversationID, userID); err == nil {
			details.UnreadCount = unreadCount
		}

		c.JSON(http.StatusOK, details)
		return
	}

	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get conversation")
		return
	}

	if conversation == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}

	// Verify user is a participant
	if !conversation.IsParticipant(userID) {
		RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}

	// Enrich with other user info
	details := &ConversationWithDetails{
		Conversation: conversation,
	}

	otherUserID := conversation.GetOtherUserID(userID)
	otherUser, err := h.userRepo.GetByID(c.Request.Context(), otherUserID)
	if err == nil && otherUser != nil {
		if isPendingDeletionHiddenFromViewer(otherUser, userID) {
			RespondError(c, http.StatusNotFound, "Conversation not found")
			return
		}
		details.OtherUser = &ConversationUser{
			ID:        otherUser.ID,
			Username:  otherUser.Username,
			AvatarURL: otherUser.AvatarURL,
			Bio:       otherUser.Bio,
			Karma:     otherUser.Karma,
		}
	}

	// Get latest message
	latestMsg, err := h.messageRepo.GetLatestMessage(c.Request.Context(), conversation.ID, userID)
	if err == nil && latestMsg != nil {
		details.LatestMessage = latestMsg
	}

	// Get unread count
	unreadCount, err := h.messageRepo.GetUnreadCount(c.Request.Context(), conversation.ID, userID)
	if err == nil {
		details.UnreadCount = unreadCount
	}

	c.JSON(http.StatusOK, details)
}

// DeleteConversation deletes a conversation.
// @Summary      Delete conversation
// @Tags         Conversations
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id} [delete]
func (h *ConversationsHandler) DeleteConversation(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	// Get delete scope from query parameter
	deleteFor := strings.ToLower(strings.TrimSpace(c.DefaultQuery("delete_for", "me")))
	if deleteFor != "me" && deleteFor != "both" {
		RespondError(c, http.StatusBadRequest, "Invalid delete_for value. Must be 'me' or 'both'")
		return
	}

	// Verify conversation exists and user is a participant
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get conversation")
		return
	}

	if conversation == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}

	if !conversation.IsParticipant(userID) {
		RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}

	if deleteFor == "both" {
		// Hard delete all user's messages
		if err := h.conversationRepo.HardDeleteMessages(c.Request.Context(), conversationID, userID); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to delete messages")
			return
		}
	}

	// Soft delete conversation for this user
	if err := h.conversationRepo.SoftDeleteForUser(c.Request.Context(), conversationID, userID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete conversation")
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

// ArchiveConversation archives a conversation.
// @Summary      Archive conversation
// @Tags         Conversations
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id}/archive [put]
func (h *ConversationsHandler) ArchiveConversation(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	// Verify conversation exists and user is a participant
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get conversation")
		return
	}

	if conversation == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}

	// Check permissions based on conversation type
	switch conversation.ConversationType {
	case "dm", "":
		if !conversation.IsParticipant(userID) {
			RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
			return
		}
	case "mod_mail":
		// For mod mail, check if user is a participant in conversation_participants table
		var count int
		err := h.pool.QueryRow(c.Request.Context(), `
			SELECT COUNT(*) FROM conversation_participants
			WHERE conversation_id = $1 AND user_id = $2
		`, conversationID, userID).Scan(&count)
		if err != nil || count == 0 {
			RespondError(c, http.StatusForbidden, "You are not a participant in this mod mail conversation")
			return
		}
	}

	// Archive the conversation
	if err := h.conversationRepo.Archive(c.Request.Context(), conversationID, userID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to archive conversation")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Conversation archived successfully"})
}

// ArchiveConversationBatch archives multiple conversations at once.
// @Summary      Archive conversations in batch
// @Tags         Conversations
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/archive-batch [post]
func (h *ConversationsHandler) ArchiveConversationBatch(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req ArchiveBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	if len(req.ConversationIDs) == 0 {
		RespondError(c, http.StatusBadRequest, "conversation_ids must contain at least one ID")
		return
	}
	if len(req.ConversationIDs) > 100 {
		RespondError(c, http.StatusBadRequest, "conversation_ids cannot exceed 100 IDs")
		return
	}

	seen := make(map[int]struct{}, len(req.ConversationIDs))
	uniqueIDs := make([]int, 0, len(req.ConversationIDs))
	for _, id := range req.ConversationIDs {
		if id <= 0 {
			RespondError(c, http.StatusBadRequest, "conversation_ids must contain only positive IDs")
			return
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		uniqueIDs = append(uniqueIDs, id)
	}

	if err := h.conversationRepo.ArchiveBatch(c.Request.Context(), uniqueIDs, userID); err != nil {
		if err == pgx.ErrNoRows {
			RespondError(c, http.StatusForbidden, "One or more conversations are invalid or you are not a participant")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to archive conversations")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Conversations archived successfully",
		"count":   len(uniqueIDs),
	})
}

// UnarchiveConversation restores an archived conversation.
// @Summary      Unarchive conversation
// @Tags         Conversations
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id}/unarchive [put]
func (h *ConversationsHandler) UnarchiveConversation(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	// Unarchive the conversation (permission check is done in the repository method)
	if err := h.conversationRepo.Unarchive(c.Request.Context(), conversationID, userID); err != nil {
		if err == pgx.ErrNoRows {
			RespondError(c, http.StatusForbidden, "You are not a participant in this conversation or conversation is not archived")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to unarchive conversation")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Conversation unarchived successfully"})
}

// MuteConversation mutes notifications for a conversation.
// @Summary      Mute conversation
// @Tags         Conversations
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id}/mute [put]
func (h *ConversationsHandler) MuteConversation(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	if _, ok := h.ensureConversationParticipant(c, conversationID, userID); !ok {
		return
	}

	if err := h.conversationRepo.SetMuted(c.Request.Context(), conversationID, userID, true); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to mute conversation")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Conversation muted successfully"})
}

// UnmuteConversation unmutes notifications for a conversation.
// @Summary      Unmute conversation
// @Tags         Conversations
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id}/unmute [put]
func (h *ConversationsHandler) UnmuteConversation(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	if _, ok := h.ensureConversationParticipant(c, conversationID, userID); !ok {
		return
	}

	if err := h.conversationRepo.SetMuted(c.Request.Context(), conversationID, userID, false); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unmute conversation")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Conversation unmuted successfully"})
}

type chatSettingsResponse struct {
	// AutoDeleteAfterSeconds is the per-chat override in whole seconds.
	// nil means no per-chat override is set (conversation inherits global default).
	// 0 would mean "never" but is never returned — nil is used instead.
	AutoDeleteAfterSeconds *int `json:"auto_delete_after_seconds"`
}

// GetChatSettings returns the requesting user's per-chat auto-delete setting.
// @Summary      Get chat settings
// @Tags         Conversations
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  chatSettingsResponse
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id}/settings [get]
func (h *ConversationsHandler) GetChatSettings(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	conv, ok := h.ensureConversationParticipant(c, conversationID, userID)
	if !ok {
		return
	}
	if conv.ConversationType == "mod_mail" {
		RespondError(c, http.StatusBadRequest, "Auto-delete is not available for mod mail conversations")
		return
	}

	if h.autoDeleteSvc == nil {
		RespondError(c, http.StatusInternalServerError, "Auto-delete service unavailable")
		return
	}
	// Use the raw per-chat setting (no global fallback) so the frontend can
	// distinguish "no override" (nil → show 'Using global default') from
	// "override equals global value" (non-nil with same duration).
	d, err := h.autoDeleteSvc.GetRawChatSetting(c.Request.Context(), userID, conversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load chat settings")
		return
	}

	resp := chatSettingsResponse{}
	if d != nil {
		secs := int(d.Seconds())
		resp.AutoDeleteAfterSeconds = &secs
	}
	c.JSON(http.StatusOK, resp)
}

type updateChatSettingsRequest struct {
	// AutoDeleteAfterSeconds is the desired duration in whole seconds.
	// 0 or nil clears the per-chat override (reverts to global default).
	AutoDeleteAfterSeconds *int  `json:"auto_delete_after_seconds"`
	ApplyRetroactive       *bool `json:"apply_retroactive"`
}

// UpdateChatSettings sets the per-chat auto-delete override for the requesting user.
// @Summary      Update chat settings
// @Tags         Conversations
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id}/settings [patch]
func (h *ConversationsHandler) UpdateChatSettings(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	conv, ok := h.ensureConversationParticipant(c, conversationID, userID)
	if !ok {
		return
	}
	if conv.ConversationType == "mod_mail" {
		RespondError(c, http.StatusBadRequest, "Auto-delete is not available for mod mail conversations")
		return
	}

	var req updateChatSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	// 0 or nil seconds means "clear the override" (never).
	var interval *time.Duration
	if req.AutoDeleteAfterSeconds != nil && *req.AutoDeleteAfterSeconds > 0 {
		d := time.Duration(*req.AutoDeleteAfterSeconds) * time.Second
		interval = &d
	}

	if h.autoDeleteSvc == nil {
		RespondError(c, http.StatusInternalServerError, "Auto-delete service unavailable")
		return
	}
	retroactive := req.ApplyRetroactive != nil && *req.ApplyRetroactive
	if err := h.autoDeleteSvc.UpdateChatSetting(c.Request.Context(), userID, conversationID, interval, retroactive); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update chat settings")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Chat settings updated"})
}

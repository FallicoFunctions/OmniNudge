package handlers

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/ports"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/websocket"
)

// MessagesHandler handles HTTP requests for messages
type MessagesHandler struct {
	pool             *pgxpool.Pool
	messageRepo      ports.MessageRepository
	conversationRepo ports.ConversationRepository
	userSettingsRepo ports.UserSettingsRepository
	hub              HubInterface
	notifService     *services.NotificationService
	queueClient      *queue.QueueClient
	cache            services.Cache
	autoDeleteSvc    *services.AutoDeleteService
}

// HubInterface defines the methods we need from the WebSocket hub
type HubInterface interface {
	Broadcast(message *websocket.Message)
	IsUserOnline(userID int) bool
}

// NewMessagesHandler creates a new messages handler
func NewMessagesHandler(
	pool *pgxpool.Pool,
	messageRepo ports.MessageRepository,
	conversationRepo ports.ConversationRepository,
	userSettingsRepo ports.UserSettingsRepository,
	hub HubInterface,
	notifService *services.NotificationService,
	cache services.Cache,
	queueClient ...*queue.QueueClient,
) *MessagesHandler {
	var qc *queue.QueueClient
	if len(queueClient) > 0 {
		qc = queueClient[0]
	}
	return &MessagesHandler{
		pool:             pool,
		messageRepo:      messageRepo,
		conversationRepo: conversationRepo,
		userSettingsRepo: userSettingsRepo,
		hub:              hub,
		notifService:     notifService,
		queueClient:      qc,
		cache:            cache,
	}
}

// WithAutoDeleteService attaches the auto-delete service to the handler.
func (h *MessagesHandler) WithAutoDeleteService(svc *services.AutoDeleteService) *MessagesHandler {
	h.autoDeleteSvc = svc
	return h
}

func (h *MessagesHandler) isAdmin(ctx context.Context, userID int) (bool, error) {
	var isAdmin bool
	err := h.pool.QueryRow(ctx, `
		SELECT role = 'admin' FROM users WHERE id = $1
	`, userID).Scan(&isAdmin)
	return isAdmin, err
}

func (h *MessagesHandler) getConversationType(ctx context.Context, conversationID int) (string, error) {
	var conversationType string
	err := h.pool.QueryRow(ctx, `
		SELECT COALESCE(conversation_type, 'dm') AS conversation_type
		FROM conversations
		WHERE id = $1
	`, conversationID).Scan(&conversationType)
	return conversationType, err
}

func (h *MessagesHandler) canAccessConversation(ctx context.Context, conversationID, userID int) (bool, error) {
	conversationType, err := h.getConversationType(ctx, conversationID)
	if err != nil {
		return false, err
	}

	if conversationType == "mod_mail" {
		var isParticipant bool
		err = h.pool.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM conversation_participants
				WHERE conversation_id = $1 AND user_id = $2
			)
		`, conversationID, userID).Scan(&isParticipant)
		if err != nil {
			return false, err
		}
		if isParticipant {
			return true, nil
		}
		isAdmin, adminErr := h.isAdmin(ctx, userID)
		if adminErr != nil {
			return false, adminErr
		}
		return isAdmin, nil
	}

	if conversationType == "group" {
		var isParticipant bool
		err = h.pool.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM conversation_participants
				WHERE conversation_id = $1 AND user_id = $2
			)
		`, conversationID, userID).Scan(&isParticipant)
		if err != nil {
			return false, err
		}
		return isParticipant, nil
	}

	conversation, err := h.conversationRepo.GetByID(ctx, conversationID)
	if err != nil {
		return false, err
	}
	if conversation == nil {
		return false, nil
	}
	return conversation.IsParticipant(userID), nil
}

func (h *MessagesHandler) isSenderBlockedByViewer(ctx context.Context, viewerID, senderID int) (bool, error) {
	var blocked bool
	err := h.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM blocked_users
			WHERE blocker_id = $1 AND blocked_id = $2
		)
	`, viewerID, senderID).Scan(&blocked)
	return blocked, err
}

func (h *MessagesHandler) unarchiveDMForRecipient(
	ctx context.Context,
	conversationID int,
	recipientID int,
) (bool, error) {
	var user1ID *int
	var user2ID *int
	var archivedForUser1 bool
	var archivedForUser2 bool
	err := h.pool.QueryRow(ctx, `
		SELECT user1_id, user2_id,
		       COALESCE(archived_for_user1, FALSE),
		       COALESCE(archived_for_user2, FALSE)
		FROM conversations
		WHERE id = $1 AND (conversation_type = 'dm' OR conversation_type IS NULL)
	`, conversationID).Scan(&user1ID, &user2ID, &archivedForUser1, &archivedForUser2)
	if err != nil {
		return false, err
	}

	targetUser1 := user1ID != nil && *user1ID == recipientID
	targetUser2 := user2ID != nil && *user2ID == recipientID
	if (!targetUser1 && !targetUser2) || (targetUser1 && !archivedForUser1) || (targetUser2 && !archivedForUser2) {
		return false, nil
	}

	// Clear recipient archive flag only. If both sides are now unarchived, clear legacy archived_at/by as well.
	_, err = h.pool.Exec(ctx, `
		UPDATE conversations
			SET archived_for_user1 = CASE WHEN user1_id = $2 THEN FALSE ELSE archived_for_user1 END,
			    archived_for_user2 = CASE WHEN user2_id = $2 THEN FALSE ELSE archived_for_user2 END,
		    archived_at = CASE
		      WHEN (
		        CASE WHEN user1_id = $2 THEN FALSE ELSE COALESCE(archived_for_user1, FALSE) END
		      ) = FALSE
		      AND (
		        CASE WHEN user2_id = $2 THEN FALSE ELSE COALESCE(archived_for_user2, FALSE) END
		      ) = FALSE
		      THEN NULL
		      ELSE archived_at
		    END,
		    archived_by = CASE
		      WHEN (
		        CASE WHEN user1_id = $2 THEN FALSE ELSE COALESCE(archived_for_user1, FALSE) END
		      ) = FALSE
		      AND (
		        CASE WHEN user2_id = $2 THEN FALSE ELSE COALESCE(archived_for_user2, FALSE) END
		      ) = FALSE
		      THEN NULL
		      ELSE archived_by
		    END
			WHERE id = $1 AND (conversation_type = 'dm' OR conversation_type IS NULL)
	`, conversationID, recipientID)
	if err != nil {
		return false, err
	}

	return true, nil
}

func (h *MessagesHandler) shouldAutoUnarchiveRecipient(
	ctx context.Context,
	recipientID int,
) bool {
	if h.userSettingsRepo == nil {
		return true
	}

	settings, err := h.userSettingsRepo.GetByUserID(ctx, recipientID)
	if err != nil {
		log.Printf("[SendMessage] Failed to load recipient settings for auto-unarchive: recipient_id=%d err=%v", recipientID, err)
		return true
	}
	if settings == nil {
		return true
	}
	return settings.AutoUnarchiveOnMessage
}

func (h *MessagesHandler) getConversationParticipantIDs(ctx context.Context, conversationID int) ([]int, error) {
	conversationType, err := h.getConversationType(ctx, conversationID)
	if err != nil {
		return nil, err
	}

	if conversationType == "mod_mail" {
		rows, err := h.pool.Query(ctx, `
			SELECT user_id
			FROM conversation_participants
			WHERE conversation_id = $1
		`, conversationID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		participants := make([]int, 0, 8)
		for rows.Next() {
			var uid int
			if scanErr := rows.Scan(&uid); scanErr != nil {
				return nil, scanErr
			}
			participants = append(participants, uid)
		}
		return participants, rows.Err()
	}

	conversation, err := h.conversationRepo.GetByID(ctx, conversationID)
	if err != nil {
		return nil, err
	}
	if conversation == nil {
		return nil, pgx.ErrNoRows
	}

	participants := make([]int, 0, 2)
	if conversation.User1ID != nil && *conversation.User1ID != 0 {
		participants = append(participants, *conversation.User1ID)
	}
	if conversation.User2ID != nil && *conversation.User2ID != 0 {
		participants = append(participants, *conversation.User2ID)
	}
	return participants, nil
}

func buildPinnedMessagePreview(messageType, encryptedContent string) string {
	if messageType != "text" {
		return "[" + messageType + "]"
	}

	const maxPreviewChars = 120
	runes := []rune(encryptedContent)
	if len(runes) <= maxPreviewChars {
		return encryptedContent
	}
	return string(runes[:maxPreviewChars]) + "..."
}

func (h *MessagesHandler) broadcastPinEvent(
	ctx context.Context,
	conversationID int,
	eventType string,
	messageID int,
	pinnedBy *int,
	pinnedAt *time.Time,
	messageType string,
	encryptedContent string,
) {
	if h.hub == nil {
		return
	}

	participants, err := h.getConversationParticipantIDs(ctx, conversationID)
	if err != nil {
		log.Printf("[MessagesHandler] failed to get participants for pin event: conversation_id=%d err=%v", conversationID, err)
		return
	}

	event := models.PinEvent{
		Type:           eventType,
		MessageID:      messageID,
		ConversationID: conversationID,
		PinnedBy:       pinnedBy,
		PinnedAt:       pinnedAt,
		Preview:        buildPinnedMessagePreview(messageType, encryptedContent),
		MessageType:    messageType,
	}

	for _, participantID := range participants {
		if participantID == 0 {
			continue
		}
		h.hub.Broadcast(&websocket.Message{
			RecipientID: participantID,
			Type:        eventType,
			Payload:     event,
		})
	}
}

func (h *MessagesHandler) broadcastThreadReplyAddedEvent(
	ctx context.Context,
	conversationID int,
	threadRoot int,
	replyCount int,
	message *models.Message,
) {
	if h.hub == nil {
		return
	}

	participants, err := h.getConversationParticipantIDs(ctx, conversationID)
	if err != nil {
		log.Printf("[MessagesHandler] failed to get participants for thread event: conversation_id=%d err=%v", conversationID, err)
		return
	}

	event := models.ThreadUpdateEvent{
		Type:           "thread_reply_added",
		ConversationID: conversationID,
		ThreadRoot:     threadRoot,
		ReplyID:        message.ID,
		ReplyCount:     replyCount,
		Message:        message,
	}

	for _, participantID := range participants {
		if participantID == 0 {
			continue
		}
		h.hub.Broadcast(&websocket.Message{
			RecipientID: participantID,
			Type:        "thread_reply_added",
			Payload:     event,
		})
	}
}

// sendPushNotification is deprecated and removed in favor of NotificationService.SendMessagePush

// SendMessageRequest represents the request body for sending a message
type SendMessageRequest struct {
	ConversationID           int            `json:"conversation_id" binding:"required"`
	EncryptedContent         string         `json:"encrypted_content,omitempty" binding:"omitempty,max=65536"` // Base64 encoded encrypted blob
	SenderEncryptedContent   *string        `json:"sender_encrypted_content,omitempty"`
	MessageType              string         `json:"message_type" binding:"required"` // "text", "image", "video", "audio", "file"
	ReplyTo                  *int           `json:"reply_to,omitempty"`
	MediaFileID              *int           `json:"media_file_id,omitempty"` // References media_files table
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

type ForwardMessageRequest struct {
	MessageID                int            `json:"message_id" binding:"required"`
	ConversationIDs          []int          `json:"conversation_ids" binding:"required"`
	IncludeMedia             bool           `json:"include_media"`
	EncryptedContent         *string        `json:"encrypted_content,omitempty"`
	SenderEncryptedContent   *string        `json:"sender_encrypted_content,omitempty"`
	EncryptionVersion        *string        `json:"encryption_version,omitempty"`
	MediaEncryptionKey       *string        `json:"media_encryption_key,omitempty"`
	MediaEncryptionIV        *string        `json:"media_encryption_iv,omitempty"`
	SenderMediaEncryptionKey *string        `json:"sender_media_encryption_key,omitempty"`
	IsMultiRecipient         *bool          `json:"is_multi_recipient,omitempty"`
	SharedEncryptionIV       *string        `json:"shared_encryption_iv,omitempty"`
	RecipientKeys            map[int]string `json:"recipient_keys,omitempty"`
}

type forwardTargetContext struct {
	conversationID         int
	conversationType       string
	participantIDs         []int
	recipientID            int
	encryptedContent       string
	senderEncryptedContent *string
}

const maxThreadDepth = 10

func copyStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}

// SendMessage sends a new message in a conversation.
// @Summary      Send message
// @Tags         Messages
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      201  {object}  models.Message
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages [post]
func (h *MessagesHandler) SendMessage(c *gin.Context) {
	// Get user ID from context (set by AuthRequired middleware)
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate message type
	validTypes := map[string]bool{"text": true, "image": true, "video": true, "audio": true, "file": true}
	if !validTypes[req.MessageType] {
		RespondError(c, http.StatusBadRequest, "Invalid message type. Must be: text, image, video, audio, or file")
		return
	}

	hasMedia := req.MediaFileID != nil
	if !hasMedia && req.MediaURL != nil {
		hasMedia = strings.TrimSpace(*req.MediaURL) != ""
	}

	if strings.TrimSpace(req.EncryptedContent) == "" && !hasMedia {
		RespondError(c, http.StatusBadRequest, "Message content or media is required")
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
			RespondError(c, http.StatusNotFound, "Conversation not found")
		} else {
			RespondError(c, http.StatusInternalServerError, "Failed to get conversation")
		}
		return
	}

	var recipientID int
	var effectiveReplyTo *int
	var threadRoot *int
	flattenedToRoot := false

	// For group conversations, enforce mute/ban and slow mode restrictions
	if conversationType == "group" {
		var restrictionType string
		var restrictionExpiresAt *time.Time
		restrErr := h.pool.QueryRow(c.Request.Context(), `
			SELECT restriction_type, expires_at
			FROM group_member_restrictions
			WHERE conversation_id = $1 AND user_id = $2
			  AND (expires_at IS NULL OR expires_at > NOW())
			ORDER BY restriction_type ASC
			LIMIT 1
		`, req.ConversationID, userID).Scan(&restrictionType, &restrictionExpiresAt)
		if restrErr == nil && restrictionType != "" {
			if restrictionType == "ban" {
				RespondError(c, http.StatusForbidden, "You are banned from this group")
				return
			}
			if restrictionType == "mute" {
				RespondError(c, http.StatusForbidden, "You are muted in this group")
				return
			}
		}

		// Check slow mode (skip for admins/owners)
		var userRole string
		h.pool.QueryRow(c.Request.Context(), `
			SELECT role FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2
		`, req.ConversationID, userID).Scan(&userRole) //nolint:errcheck // role lookup failure defaults to no exemption; non-fatal

		if userRole != "admin" && userRole != "owner" {
			var slowMode int
			h.pool.QueryRow(c.Request.Context(), `SELECT slow_mode_seconds FROM conversations WHERE id=$1`, req.ConversationID).Scan(&slowMode) //nolint:errcheck // slow-mode lookup failure defaults to 0 (no slow mode); non-fatal
			if slowMode > 0 && h.cache != nil {
				cacheKey := fmt.Sprintf("slowmode:%d:%d", req.ConversationID, userID)
				if val, exists, _ := h.cache.Get(c.Request.Context(), cacheKey); exists {
					expiryUnix, _ := strconv.ParseInt(val, 10, 64)
					remaining := time.Until(time.Unix(expiryUnix, 0))
					if remaining > 0 {
						c.JSON(http.StatusTooManyRequests, gin.H{
							"error":               "Slow mode is active",
							"retry_after_seconds": int(remaining.Seconds()) + 1,
						})
						return
					}
				}
				expiryTime := time.Now().Add(time.Duration(slowMode) * time.Second)
				_ = h.cache.Set(c.Request.Context(), cacheKey, strconv.FormatInt(expiryTime.Unix(), 10), time.Duration(slowMode)*time.Second)
			}
		}
	}

	// For mod_mail conversations, verify participation differently
	if conversationType == "mod_mail" {
		var isParticipant bool
		err = h.pool.QueryRow(c.Request.Context(), `
			SELECT EXISTS(
				SELECT 1 FROM conversation_participants
				WHERE conversation_id = $1 AND user_id = $2
			)
		`, req.ConversationID, userID).Scan(&isParticipant)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to check participant status")
			return
		}
		if !isParticipant {
			isAdmin, err := h.isAdmin(c.Request.Context(), userID)
			if err != nil {
				RespondError(c, http.StatusInternalServerError, "Failed to check admin status")
				return
			}
			if !isAdmin {
				RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
				return
			}
		}
		// For mod mail, we don't target a single recipient; use sender as recipient to satisfy schema
		recipientID = userID
	} else if conversationType == "group" {
		// Group conversations use conversation_participants; User1ID/User2ID are NULL for groups.
		var isParticipant bool
		err = h.pool.QueryRow(c.Request.Context(), `
			SELECT EXISTS(
				SELECT 1 FROM conversation_participants
				WHERE conversation_id = $1 AND user_id = $2
			)
		`, req.ConversationID, userID).Scan(&isParticipant)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to check participant status")
			return
		}
		if !isParticipant {
			RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
			return
		}
		// Group messages have no single recipient; use sender to satisfy schema.
		recipientID = userID
	} else {
		// For regular DM conversations, use the existing method
		conversation, err := h.conversationRepo.GetByID(c.Request.Context(), req.ConversationID)
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

		// Determine recipient (the other user in the conversation)
		recipientID = conversation.GetOtherUserID(userID)

		// Check if sender is blocked by recipient
		var isBlocked bool
		blockCheckQuery := `
			SELECT EXISTS(
				SELECT 1 FROM blocked_users
				WHERE blocker_id = $1 AND blocked_id = $2
			)
		`
		err = h.pool.QueryRow(c.Request.Context(), blockCheckQuery, recipientID, userID).Scan(&isBlocked)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
			return
		}

		if isBlocked {
			RespondError(c, http.StatusNotFound, blockingSettingsErrorMessage)
			return
		}
	}

	if req.ReplyTo != nil {
		effectiveReplyTo = req.ReplyTo
		if *effectiveReplyTo <= 0 {
			RespondError(c, http.StatusBadRequest, "reply_to must be a positive message ID")
			return
		}
		var parentConversationID int
		var parentThreadRoot sql.NullInt64
		err = h.pool.QueryRow(c.Request.Context(), `
			SELECT conversation_id, thread_root
			FROM messages
			WHERE id = $1
		`, *effectiveReplyTo).Scan(&parentConversationID, &parentThreadRoot)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				RespondError(c, http.StatusNotFound, "Reply target message not found")
				return
			}
			RespondError(c, http.StatusInternalServerError, "Failed to validate reply target")
			return
		}
		if parentConversationID != req.ConversationID {
			RespondError(c, http.StatusBadRequest, "reply_to must reference a message in the same conversation")
			return
		}
		rootID := *effectiveReplyTo
		if parentThreadRoot.Valid {
			rootID = int(parentThreadRoot.Int64)
		}
		threadRoot = &rootID

		// Limit thread depth to avoid pathological nesting.
		// If parent is already at max depth, flatten the new reply to root.
		var parentDepth int
		err = h.pool.QueryRow(c.Request.Context(), `
			WITH RECURSIVE ancestors AS (
				SELECT id, reply_to, 0 AS depth
				FROM messages
				WHERE id = $1
				UNION ALL
				SELECT m.id, m.reply_to, a.depth + 1
				FROM messages m
				JOIN ancestors a ON a.reply_to = m.id
				WHERE a.reply_to IS NOT NULL AND a.depth < 100
			)
			SELECT COALESCE(MAX(depth), 0)
			FROM ancestors
		`, *effectiveReplyTo).Scan(&parentDepth)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to calculate thread depth")
			return
		}
		if parentDepth >= maxThreadDepth {
			effectiveReplyTo = &rootID
			threadRoot = &rootID
			flattenedToRoot = true
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
		SenderID:                 userID,
		RecipientID:              recipientID,
		EncryptedContent:         req.EncryptedContent,
		SenderEncryptedContent:   req.SenderEncryptedContent,
		MessageType:              req.MessageType,
		ReplyTo:                  effectiveReplyTo,
		ThreadRoot:               threadRoot,
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

	if h.autoDeleteSvc != nil {
		deleteAt, err := h.autoDeleteSvc.ComputeDeleteAt(c.Request.Context(), userID, req.ConversationID, time.Now())
		if err != nil {
			log.Printf("[SendMessage] Failed to compute delete_at: user_id=%d conversation_id=%d err=%v", userID, req.ConversationID, err)
		} else {
			message.DeleteAt = deleteAt
		}
	}

	if err := h.messageRepo.Create(c.Request.Context(), message); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to send message")
		return
	}
	if effectiveReplyTo != nil {
		// Keep parent direct-reply count for message-level metadata.
		if _, err := h.pool.Exec(c.Request.Context(), `
			UPDATE messages
			SET reply_count = reply_count + 1
			WHERE id = $1
		`, *effectiveReplyTo); err != nil {
			_, _ = h.pool.Exec(c.Request.Context(), `DELETE FROM messages WHERE id = $1`, message.ID)
			RespondError(c, http.StatusInternalServerError, "Failed to update thread metadata")
			return
		}

		// Also increment root aggregate so root preview count tracks total thread replies.
		if threadRoot != nil && *threadRoot > 0 && *threadRoot != *effectiveReplyTo {
			if _, err := h.pool.Exec(c.Request.Context(), `
				UPDATE messages
				SET reply_count = reply_count + 1
				WHERE id = $1
			`, *threadRoot); err != nil {
				_, _ = h.pool.Exec(c.Request.Context(), `DELETE FROM messages WHERE id = $1`, message.ID)
				RespondError(c, http.StatusInternalServerError, "Failed to update root thread metadata")
				return
			}
		}
	}

	// Reload message to include joined media data (URLs, types, etc.)
	fullMessage, err := h.messageRepo.GetByID(c.Request.Context(), message.ID)
	if err == nil {
		message = fullMessage
	}

	if effectiveReplyTo != nil {
		rootForEvent := *effectiveReplyTo
		if message.ThreadRoot != nil && *message.ThreadRoot > 0 {
			rootForEvent = *message.ThreadRoot
		}

		var rootReplyCount int
		if err := h.pool.QueryRow(c.Request.Context(), `
			SELECT COALESCE(reply_count, 0)
			FROM messages
			WHERE id = $1
		`, rootForEvent).Scan(&rootReplyCount); err != nil {
			log.Printf("[SendMessage] Failed to load root reply_count for thread event: root_id=%d err=%v", rootForEvent, err)
		} else {
			h.broadcastThreadReplyAddedEvent(c.Request.Context(), req.ConversationID, rootForEvent, rootReplyCount, message)
		}
	}

	if effectiveReplyTo != nil && message.ThreadRoot != nil && *message.ThreadRoot > 0 && h.notifService != nil {
		go h.notifService.NotifyThreadReply(
			context.Background(),
			req.ConversationID,
			*message.ThreadRoot,
			message.ID,
			message.SenderID,
		)
	}

	// Update conversation's last_message_at timestamp and re-add users if deleted
	if err := h.conversationRepo.UpdateLastMessageAt(c.Request.Context(), req.ConversationID); err != nil {
		// Log error but don't fail the request
		c.Writer.Header().Add("X-Warning", "Failed to update conversation timestamp")
	}

	if flattenedToRoot {
		c.Writer.Header().Set("X-Thread-Flattened", "true")
	}

	// Re-add users to conversation if they had deleted it (for DM conversations only).
	// If the recipient archived the DM, auto-unarchive it on new incoming message.
	if conversationType == "dm" {
		_, _ = h.pool.Exec(c.Request.Context(), `
			UPDATE conversations
			SET deleted_for_user1 = FALSE,
			    deleted_for_user2 = FALSE
			WHERE id = $1 AND conversation_type = 'dm'
		`, req.ConversationID)

		if h.shouldAutoUnarchiveRecipient(c.Request.Context(), recipientID) {
			unarchivedForRecipient, unarchiveErr := h.unarchiveDMForRecipient(c.Request.Context(), req.ConversationID, recipientID)
			if unarchiveErr != nil {
				log.Printf("[SendMessage] Failed to auto-unarchive recipient conversation: conversation_id=%d recipient_id=%d err=%v", req.ConversationID, recipientID, unarchiveErr)
			} else if unarchivedForRecipient && h.hub != nil {
				h.hub.Broadcast(&websocket.Message{
					RecipientID: recipientID,
					Type:        "conversation_unarchived",
					Payload: gin.H{
						"conversation_id": req.ConversationID,
						"user_id":         recipientID,
						"trigger":         "new_message",
					},
				})
			}
		}
	}

	// Broadcast message to recipient via WebSocket if they're online OR send push notification if offline
	if h.hub != nil {
		if h.hub.IsUserOnline(recipientID) {
			// Mark as delivered immediately for online recipient
			err := h.messageRepo.MarkAsDelivered(c.Request.Context(), message.ID)
			if err != nil {
				log.Printf("Failed to mark message as delivered: %v", err)
			}

			// Reload to get delivered_at timestamp
			updatedMsg, err := h.messageRepo.GetByID(c.Request.Context(), message.ID)
			if err == nil && updatedMsg != nil {
				message = updatedMsg
			}

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
					"delivered_at":    message.DeliveredAt,
				},
			})
		} else if h.notifService != nil {
			// Recipient is offline - send push notification via service (P0-042-FLAW: centralized)
			h.notifService.SendMessagePush(c.Request.Context(), message.SenderID, recipientID, message)
		}
	}

	c.JSON(http.StatusCreated, message)
}

// ForwardMessage forwards a message to another conversation.
// @Summary      Forward message
// @Tags         Messages
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      201  {object}  models.Message
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/forward [post]
func (h *MessagesHandler) ForwardMessage(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req ForwardMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.MessageID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid message_id")
		return
	}
	if len(req.ConversationIDs) == 0 {
		RespondError(c, http.StatusBadRequest, "conversation_ids is required")
		return
	}

	seen := make(map[int]struct{}, len(req.ConversationIDs))
	dedupedConversationIDs := make([]int, 0, len(req.ConversationIDs))
	for _, conversationID := range req.ConversationIDs {
		if conversationID <= 0 {
			RespondError(c, http.StatusBadRequest, "conversation_ids must contain valid IDs")
			return
		}
		if _, ok := seen[conversationID]; ok {
			continue
		}
		seen[conversationID] = struct{}{}
		dedupedConversationIDs = append(dedupedConversationIDs, conversationID)
	}
	if len(dedupedConversationIDs) > 10 {
		RespondError(c, http.StatusBadRequest, "Cannot forward to more than 10 conversations")
		return
	}

	ctx := c.Request.Context()
	original, err := h.messageRepo.GetByID(ctx, req.MessageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			RespondError(c, http.StatusNotFound, "Message not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to load message")
		return
	}

	canAccessOriginalConversation, err := h.canAccessConversation(ctx, original.ConversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to validate source conversation access")
		return
	}
	if !canAccessOriginalConversation {
		RespondError(c, http.StatusForbidden, "You are not authorized to forward this message")
		return
	}

	sourceConversationType, err := h.getConversationType(ctx, original.ConversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load source conversation type")
		return
	}
	if sourceConversationType == "dm" {
		if (original.SenderID == userID && original.DeletedForSender) || (original.RecipientID == userID && original.DeletedForRecipient) {
			RespondError(c, http.StatusForbidden, "Cannot forward a message that is deleted for you")
			return
		}
	}

	sourceParticipantIDs, err := h.getConversationParticipantIDs(ctx, original.ConversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load source participants")
		return
	}
	sourceParticipants := make(map[int]struct{}, len(sourceParticipantIDs))
	for _, participantID := range sourceParticipantIDs {
		if participantID == 0 {
			continue
		}
		sourceParticipants[participantID] = struct{}{}
	}

	isEncryptedForward := original.EncryptionVersion != "plaintext" && original.EncryptionVersion != "none"
	forwardEncryptionVersion := original.EncryptionVersion
	if req.EncryptionVersion != nil && strings.TrimSpace(*req.EncryptionVersion) != "" {
		forwardEncryptionVersion = strings.TrimSpace(*req.EncryptionVersion)
	}
	if isEncryptedForward {
		if forwardEncryptionVersion == "plaintext" || forwardEncryptionVersion == "none" {
			RespondError(c, http.StatusUnprocessableEntity, "Encrypted forwards cannot downgrade encryption_version")
			return
		}
		if req.EncryptedContent == nil || strings.TrimSpace(*req.EncryptedContent) == "" {
			RespondError(c, http.StatusUnprocessableEntity, "Encrypted forwards require new encrypted_content")
			return
		}
	}
	targetContexts := make([]forwardTargetContext, 0, len(dedupedConversationIDs))
	for _, targetConversationID := range dedupedConversationIDs {
		canAccessTargetConversation, err := h.canAccessConversation(ctx, targetConversationID, userID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to validate target conversation access")
			return
		}
		if !canAccessTargetConversation {
			RespondError(c, http.StatusForbidden, fmt.Sprintf("You are not a participant in conversation %d", targetConversationID))
			return
		}
		targetParticipantIDs, err := h.getConversationParticipantIDs(ctx, targetConversationID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to load target participants")
			return
		}
		targetParticipants := make(map[int]struct{}, len(targetParticipantIDs))
		for _, participantID := range targetParticipantIDs {
			if participantID == 0 {
				continue
			}
			targetParticipants[participantID] = struct{}{}
		}

		targetConversationType, err := h.getConversationType(ctx, targetConversationID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to load target conversation type")
			return
		}
		if isEncryptedForward {
			if len(sourceParticipants) != len(targetParticipants) {
				RespondError(c, http.StatusUnprocessableEntity, "Encrypted forward requires identical participants")
				return
			}
			for participantID := range sourceParticipants {
				if _, ok := targetParticipants[participantID]; !ok {
					RespondError(c, http.StatusUnprocessableEntity, "Encrypted forward requires identical participants")
					return
				}
			}
		}

		var targetRecipientID int
		if targetConversationType == "dm" {
			targetConversation, err := h.conversationRepo.GetByID(ctx, targetConversationID)
			if err != nil {
				RespondError(c, http.StatusInternalServerError, "Failed to load target conversation")
				return
			}
			if targetConversation == nil {
				RespondError(c, http.StatusNotFound, "Target conversation not found")
				return
			}
			targetRecipientID = targetConversation.GetOtherUserID(userID)

			var isBlocked bool
			if err := h.pool.QueryRow(ctx, `
				SELECT EXISTS(
					SELECT 1
					FROM blocked_users
					WHERE blocker_id = $1 AND blocked_id = $2
				)
			`, targetRecipientID, userID).Scan(&isBlocked); err != nil {
				RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
				return
			}
			if isBlocked {
				RespondError(c, http.StatusNotFound, blockingSettingsErrorMessage)
				return
			}
		} else {
			// For mod mail, keep recipient as sender to satisfy schema.
			targetRecipientID = userID
		}

		resolvedEncryptedContent := original.EncryptedContent
		resolvedSenderEncryptedContent := copyStringPtr(original.SenderEncryptedContent)
		if isEncryptedForward {
			resolvedEncryptedContent = strings.TrimSpace(*req.EncryptedContent)
			if targetConversationType == "dm" {
				if req.SenderEncryptedContent == nil || strings.TrimSpace(*req.SenderEncryptedContent) == "" {
					RespondError(c, http.StatusUnprocessableEntity, "Encrypted DM forwards require new sender_encrypted_content")
					return
				}
				resolvedSenderEncryptedContent = copyStringPtr(req.SenderEncryptedContent)
			} else {
				resolvedSenderEncryptedContent = copyStringPtr(req.SenderEncryptedContent)
			}
		}

		targetContexts = append(targetContexts, forwardTargetContext{
			conversationID:         targetConversationID,
			conversationType:       targetConversationType,
			participantIDs:         targetParticipantIDs,
			recipientID:            targetRecipientID,
			encryptedContent:       resolvedEncryptedContent,
			senderEncryptedContent: resolvedSenderEncryptedContent,
		})
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to start forward transaction")
		return
	}
	defer tx.Rollback(ctx)

	forwardedMessages := make([]*models.Message, 0, len(targetContexts))
	forwardedMessageIDs := make([]int, 0, len(targetContexts))
	for _, target := range targetContexts {

		forwardedMessageType := original.MessageType
		forwardedMediaFileID := original.MediaFileID
		forwardedMediaURL := original.MediaURL
		forwardedMediaType := original.MediaType
		forwardedMediaSize := original.MediaSize
		forwardedMediaEncryptionKey := original.MediaEncryptionKey
		forwardedMediaEncryptionIV := original.MediaEncryptionIV
		forwardedSenderMediaEncryptionKey := original.SenderMediaEncryptionKey
		if !req.IncludeMedia {
			forwardedMediaFileID = nil
			forwardedMediaURL = nil
			forwardedMediaType = nil
			forwardedMediaSize = nil
			forwardedMediaEncryptionKey = nil
			forwardedMediaEncryptionIV = nil
			forwardedSenderMediaEncryptionKey = nil
			if forwardedMessageType != "text" {
				forwardedMessageType = "text"
			}
		}

		newMessage := &models.Message{
			ConversationID:           target.conversationID,
			SenderID:                 userID,
			RecipientID:              target.recipientID,
			EncryptedContent:         target.encryptedContent,
			SenderEncryptedContent:   target.senderEncryptedContent,
			MessageType:              forwardedMessageType,
			MediaFileID:              forwardedMediaFileID,
			MediaURL:                 forwardedMediaURL,
			MediaType:                forwardedMediaType,
			MediaSize:                forwardedMediaSize,
			EncryptionVersion:        forwardEncryptionVersion,
			MediaEncryptionKey:       forwardedMediaEncryptionKey,
			MediaEncryptionIV:        forwardedMediaEncryptionIV,
			SenderMediaEncryptionKey: forwardedSenderMediaEncryptionKey,
			IsMultiRecipient:         original.IsMultiRecipient,
			SharedEncryptionIV:       original.SharedEncryptionIV,
			RecipientKeys:            original.RecipientKeys,
		}
		if isEncryptedForward {
			if req.MediaEncryptionKey != nil {
				newMessage.MediaEncryptionKey = req.MediaEncryptionKey
			}
			if req.MediaEncryptionIV != nil {
				newMessage.MediaEncryptionIV = req.MediaEncryptionIV
			}
			if req.SenderMediaEncryptionKey != nil {
				newMessage.SenderMediaEncryptionKey = req.SenderMediaEncryptionKey
			}
			if req.IsMultiRecipient != nil {
				newMessage.IsMultiRecipient = *req.IsMultiRecipient
			}
			if target.conversationType == "dm" && newMessage.IsMultiRecipient {
				RespondError(c, http.StatusUnprocessableEntity, "DM forwards cannot be multi-recipient")
				return
			}
			if req.SharedEncryptionIV != nil {
				newMessage.SharedEncryptionIV = req.SharedEncryptionIV
			}
			if req.RecipientKeys != nil {
				newMessage.RecipientKeys = req.RecipientKeys
			} else if newMessage.IsMultiRecipient {
				RespondError(c, http.StatusUnprocessableEntity, "Encrypted multi-recipient forwards require recipient_keys")
				return
			}
			if newMessage.IsMultiRecipient {
				if len(newMessage.RecipientKeys) != len(target.participantIDs) {
					RespondError(c, http.StatusUnprocessableEntity, "recipient_keys must match target participants")
					return
				}
				for _, participantID := range target.participantIDs {
					if participantID == 0 {
						continue
					}
					if _, ok := newMessage.RecipientKeys[participantID]; !ok {
						RespondError(c, http.StatusUnprocessableEntity, "recipient_keys must match target participants")
						return
					}
				}
			}
		}
		if target.conversationType == "mod_mail" {
			if newMessage.EncryptionVersion == "plaintext" || newMessage.EncryptionVersion == "none" || newMessage.EncryptionVersion == "" {
				RespondError(c, http.StatusUnprocessableEntity, "Mod mail forwards must remain encrypted")
				return
			}
			if !newMessage.IsMultiRecipient || newMessage.SharedEncryptionIV == nil || len(newMessage.RecipientKeys) == 0 {
				RespondError(c, http.StatusUnprocessableEntity, "Mod mail forwards require multi-recipient encryption payloads")
				return
			}
		}
		createErr := tx.QueryRow(ctx, `
			INSERT INTO messages (
				conversation_id, sender_id, recipient_id, encrypted_content, sender_encrypted_content,
				message_type, media_file_id, media_url, media_type, media_size, encryption_version,
				media_encryption_key, media_encryption_iv, sender_media_encryption_key,
				is_multi_recipient, shared_encryption_iv
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
			RETURNING id, sent_at
		`,
			newMessage.ConversationID,
			newMessage.SenderID,
			newMessage.RecipientID,
			newMessage.EncryptedContent,
			newMessage.SenderEncryptedContent,
			newMessage.MessageType,
			newMessage.MediaFileID,
			newMessage.MediaURL,
			newMessage.MediaType,
			newMessage.MediaSize,
			newMessage.EncryptionVersion,
			newMessage.MediaEncryptionKey,
			newMessage.MediaEncryptionIV,
			newMessage.SenderMediaEncryptionKey,
			newMessage.IsMultiRecipient,
			newMessage.SharedEncryptionIV,
		).Scan(&newMessage.ID, &newMessage.SentAt)
		if createErr != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to create forwarded message")
			return
		}
		if newMessage.IsMultiRecipient && len(newMessage.RecipientKeys) > 0 {
			for participantID, encryptedKey := range newMessage.RecipientKeys {
				if _, err := tx.Exec(ctx, `
					INSERT INTO message_recipient_keys (message_id, user_id, encrypted_key)
					VALUES ($1, $2, $3)
				`, newMessage.ID, participantID, encryptedKey); err != nil {
					RespondError(c, http.StatusInternalServerError, "Failed to persist recipient keys")
					return
				}
			}
		}

		if _, err := tx.Exec(ctx, `
			UPDATE messages
			SET forwarded_from = $2
			WHERE id = $1
		`, newMessage.ID, original.ID); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to annotate forwarded message")
			return
		}

		if _, err := tx.Exec(ctx, `
			UPDATE conversations
			SET last_message_at = CURRENT_TIMESTAMP
			WHERE id = $1
		`, target.conversationID); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to update conversation timestamp")
			return
		}

		forwardedMessages = append(forwardedMessages, newMessage)
		forwardedMessageIDs = append(forwardedMessageIDs, newMessage.ID)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE messages
		SET forward_count = forward_count + $2
		WHERE id = $1
	`, original.ID, len(forwardedMessageIDs)); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to increment forward count")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to commit forwarded messages")
		return
	}

	queueEnqueueErrors := 0
	for idx, newMessage := range forwardedMessages {
		target := targetContexts[idx]
		if h.queueClient != nil {
			payload := queue.MessageReencryptPayload{
				MessageID:      newMessage.ID,
				ConversationID: target.conversationID,
				EditorID:       userID,
			}
			if err := h.queueClient.EnqueueMessageReencrypt(ctx, payload); err != nil {
				queueEnqueueErrors++
				log.Printf("[ForwardMessage] failed to enqueue re-encryption job for message_id=%d: %v", newMessage.ID, err)
			}
		}

		if h.hub != nil {
			forwardedMessage, loadErr := h.messageRepo.GetByID(ctx, newMessage.ID)
			if loadErr != nil {
				log.Printf("[ForwardMessage] failed to load forwarded message for websocket broadcast: message_id=%d err=%v", newMessage.ID, loadErr)
			} else {
				for _, participantID := range target.participantIDs {
					if participantID == 0 {
						continue
					}
					h.hub.Broadcast(&websocket.Message{
						RecipientID: participantID,
						Type:        "new_message",
						Payload:     forwardedMessage,
					})
				}
			}
		}
	}

	response := gin.H{
		"original_message_id":   original.ID,
		"forwarded_message_ids": forwardedMessageIDs,
		"forwarded_count":       len(forwardedMessageIDs),
	}
	if queueEnqueueErrors > 0 {
		response["queue_warning"] = fmt.Sprintf("%d forwarding jobs could not be queued", queueEnqueueErrors)
	}

	c.JSON(http.StatusOK, response)
}

type EditMessageRequest struct {
	EncryptedContent       string  `json:"encrypted_content" binding:"required"`
	SenderEncryptedContent *string `json:"sender_encrypted_content,omitempty"`
	Content                *string `json:"content,omitempty"`
	EncryptionVersion      *string `json:"encryption_version,omitempty"`
}

type MessageEditHistoryEntry struct {
	ID                     int       `json:"id"`
	MessageID              int       `json:"message_id"`
	Content                *string   `json:"content,omitempty"`
	EncryptedContent       *string   `json:"encrypted_content,omitempty"`
	SenderEncryptedContent *string   `json:"sender_encrypted_content,omitempty"`
	EncryptionVersion      string    `json:"encryption_version"`
	EditedAt               time.Time `json:"edited_at"`
	EditedBy               int       `json:"edited_by"`
}

// GetForwardInfo returns forward chain info for a message.
// @Summary      Get message forward info
// @Tags         Messages
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Message ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/{id}/forward-info [get]
func (h *MessagesHandler) GetForwardInfo(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil || messageID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	ctx := c.Request.Context()

	var conversationID int
	var senderID int
	var forwardedFrom *int
	var forwardCount int
	err = h.pool.QueryRow(ctx, `
		SELECT conversation_id, sender_id, forwarded_from, COALESCE(forward_count, 0)
		FROM messages
		WHERE id = $1
	`, messageID).Scan(&conversationID, &senderID, &forwardedFrom, &forwardCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			RespondError(c, http.StatusNotFound, "Message not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to load message")
		return
	}

	canAccessConversation, err := h.canAccessConversation(ctx, conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to validate conversation access")
		return
	}
	if !canAccessConversation {
		RespondError(c, http.StatusForbidden, "You are not authorized to view forward info for this message")
		return
	}

	originalMessageID := messageID
	originalConversationID := conversationID
	originalSenderID := senderID
	if forwardedFrom != nil {
		originalMessageID = *forwardedFrom
		if err := h.pool.QueryRow(ctx, `
			SELECT conversation_id, sender_id, COALESCE(forward_count, 0)
			FROM messages
			WHERE id = $1
		`, originalMessageID).Scan(&originalConversationID, &originalSenderID, &forwardCount); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				originalConversationID = 0
				originalSenderID = 0
				forwardCount = 0
			} else {
				RespondError(c, http.StatusInternalServerError, "Failed to load original message")
				return
			}
		}
	}

	var originalSenderUsername string
	if originalSenderID > 0 {
		if err := h.pool.QueryRow(ctx, `
			SELECT username
			FROM users
			WHERE id = $1
		`, originalSenderID).Scan(&originalSenderUsername); err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				RespondError(c, http.StatusInternalServerError, "Failed to load original sender")
				return
			}
		}
	}

	var exposedOriginalConversationID *int
	if originalConversationID > 0 {
		canAccessOriginalConversation, err := h.canAccessConversation(ctx, originalConversationID, userID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to validate original conversation access")
			return
		}
		if canAccessOriginalConversation {
			exposedOriginalConversationID = &originalConversationID
		}
	}

	response := gin.H{
		"message_id":               messageID,
		"forwarded_from":           forwardedFrom,
		"forward_count":            forwardCount,
		"original_message_id":      originalMessageID,
		"original_sender_id":       originalSenderID,
		"original_sender":          originalSenderUsername,
		"original_conversation_id": exposedOriginalConversationID,
	}
	c.JSON(http.StatusOK, response)
}

// EditMessage edits the content of an existing message.
// @Summary      Edit message
// @Tags         Messages
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Message ID"
// @Success      200  {object}  models.Message
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/{id} [patch]
func (h *MessagesHandler) EditMessage(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil || messageID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	var req EditMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	if strings.TrimSpace(req.EncryptedContent) == "" {
		RespondError(c, http.StatusBadRequest, "encrypted_content is required")
		return
	}

	ctx := c.Request.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to start edit transaction")
		return
	}
	defer tx.Rollback(ctx)

	var conversationID int
	var senderID int
	var sentAt time.Time
	var conversationType string
	var deletedForSender bool
	var currentEncryptedContent string
	var currentSenderEncryptedContent *string
	var currentEncryptionVersion string
	var originalContent *string
	err = tx.QueryRow(ctx, `
		SELECT m.conversation_id, m.sender_id, m.sent_at,
		       COALESCE(c.conversation_type, 'dm') AS conversation_type,
		       COALESCE(deleted_for_sender, FALSE),
		       encrypted_content,
		       sender_encrypted_content,
		       COALESCE(encryption_version, 'v1'),
		       original_content
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		WHERE m.id = $1
		FOR UPDATE
	`, messageID).Scan(
		&conversationID,
		&senderID,
		&sentAt,
		&conversationType,
		&deletedForSender,
		&currentEncryptedContent,
		&currentSenderEncryptedContent,
		&currentEncryptionVersion,
		&originalContent,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			RespondError(c, http.StatusNotFound, "Message not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to load message")
		return
	}

	if senderID != userID {
		RespondError(c, http.StatusForbidden, "You can only edit your own messages")
		return
	}
	if deletedForSender {
		RespondError(c, http.StatusBadRequest, "Cannot edit deleted message")
		return
	}
	if time.Since(sentAt) > 15*time.Minute {
		RespondError(c, http.StatusForbidden, "Message can only be edited within 15 minutes")
		return
	}
	if conversationType == "mod_mail" {
		RespondError(c, http.StatusForbidden, "Editing mod mail messages is not supported")
		return
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO message_edit_history
		    (message_id, content, encrypted_content, sender_encrypted_content, encryption_version, edited_by)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, messageID, currentEncryptedContent, currentEncryptedContent, currentSenderEncryptedContent, currentEncryptionVersion, userID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to store edit history")
		return
	}

	originalContentToPersist := originalContent
	if originalContentToPersist == nil {
		originalContentToPersist = &currentEncryptedContent
	}

	nextSenderEncryptedContent := currentSenderEncryptedContent
	if req.SenderEncryptedContent != nil {
		nextSenderEncryptedContent = req.SenderEncryptedContent
	}

	nextEncryptionVersion := currentEncryptionVersion
	if req.EncryptionVersion != nil && strings.TrimSpace(*req.EncryptionVersion) != "" {
		nextEncryptionVersion = strings.TrimSpace(*req.EncryptionVersion)
	}

	var editedAt time.Time
	if err := tx.QueryRow(ctx, `
		UPDATE messages
		SET encrypted_content = $2,
		    sender_encrypted_content = $3,
		    encryption_version = $4,
		    edited = TRUE,
		    edited_at = NOW(),
		    original_content = $5
		WHERE id = $1
		RETURNING edited_at
	`, messageID, req.EncryptedContent, nextSenderEncryptedContent, nextEncryptionVersion, originalContentToPersist).Scan(&editedAt); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update message")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to commit message edit")
		return
	}

	if h.queueClient != nil {
		payload := queue.MessageReencryptPayload{
			MessageID:      messageID,
			ConversationID: conversationID,
			EditorID:       userID,
		}
		if err := h.queueClient.EnqueueMessageReencrypt(ctx, payload); err != nil {
			log.Printf("[EditMessage] failed to enqueue re-encryption job for message_id=%d: %v", messageID, err)
		}
	}

	updatedMessage, err := h.messageRepo.GetByID(ctx, messageID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Message updated but failed to load response")
		return
	}

	updatedMessage.Edited = true
	updatedMessage.EditedAt = &editedAt

	if h.hub != nil || h.notifService != nil {
		participantIDs, err := h.getConversationParticipantIDs(ctx, conversationID)
		if err != nil {
			log.Printf("[EditMessage] failed to load participants for websocket broadcast: conversation_id=%d err=%v", conversationID, err)
		} else {
			if h.hub != nil {
				for _, participantID := range participantIDs {
					if participantID == 0 {
						continue
					}
					h.hub.Broadcast(&websocket.Message{
						RecipientID: participantID,
						Type:        "message_edited",
						Payload: gin.H{
							"message_id":               messageID,
							"conversation_id":          conversationID,
							"edited_at":                editedAt,
							"edited_by":                userID,
							"encrypted_content":        req.EncryptedContent,
							"sender_encrypted_content": req.SenderEncryptedContent,
							"encryption_version":       nextEncryptionVersion,
						},
					})
				}
			}
			if h.notifService != nil {
				go h.notifService.NotifyMessageEdited(context.Background(), messageID, conversationID, userID, participantIDs)
			}
		}
	}

	c.JSON(http.StatusOK, updatedMessage)
}

// GetMessageHistory returns the edit history for a message.
// @Summary      Get message edit history
// @Tags         Messages
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Message ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/{id}/history [get]
func (h *MessagesHandler) GetMessageHistory(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil || messageID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	ctx := c.Request.Context()

	var conversationID int
	err = h.pool.QueryRow(ctx, `
		SELECT conversation_id
		FROM messages
		WHERE id = $1
	`, messageID).Scan(&conversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			RespondError(c, http.StatusNotFound, "Message not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to load message")
		return
	}

	canAccess, err := h.canAccessConversation(ctx, conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to validate conversation access")
		return
	}
	if !canAccess {
		RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}

	var total int
	err = h.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM message_edit_history
		WHERE message_id = $1
	`, messageID).Scan(&total)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load message edit history")
		return
	}

	rows, err := h.pool.Query(ctx, `
		SELECT id, message_id, content, encrypted_content, sender_encrypted_content,
		       COALESCE(encryption_version, 'plaintext'), edited_at, edited_by
		FROM message_edit_history
		WHERE message_id = $1
		ORDER BY edited_at ASC, id ASC
		LIMIT $2 OFFSET $3
	`, messageID, limit, offset)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load message edit history")
		return
	}
	defer rows.Close()

	history := make([]MessageEditHistoryEntry, 0, limit)
	for rows.Next() {
		var entry MessageEditHistoryEntry
		if err := rows.Scan(
			&entry.ID,
			&entry.MessageID,
			&entry.Content,
			&entry.EncryptedContent,
			&entry.SenderEncryptedContent,
			&entry.EncryptionVersion,
			&entry.EditedAt,
			&entry.EditedBy,
		); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to parse message edit history")
			return
		}
		history = append(history, entry)
	}
	if err := rows.Err(); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to iterate message edit history")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"history":    history,
		"message_id": messageID,
		"total":      total,
		"limit":      limit,
		"offset":     offset,
	})
}

// GetMessages returns messages for a conversation.
// @Summary      Get conversation messages
// @Tags         Messages
// @Security     BearerAuth
// @Produce      json
// @Param        id      path   int    true   "Conversation ID"
// @Param        limit   query  int    false  "Page size (default 50)"
// @Param        before  query  int    false  "Load messages before this ID"
// @Param        after   query  int    false  "Load messages after this ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id}/messages [get]
func (h *MessagesHandler) GetMessages(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	if c.GetBool("shadow_banned") {
		// Silently accept but do not persist
		c.JSON(http.StatusCreated, gin.H{"message": "Message sent", "shadow_banned": true})
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
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
			RespondError(c, http.StatusNotFound, "Conversation not found")
		} else {
			RespondError(c, http.StatusInternalServerError, "Failed to get conversation")
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
		`, conversationID, userID).Scan(&isParticipant)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to check participant status")
			return
		}
		if !isParticipant {
			isAdmin, err := h.isAdmin(c.Request.Context(), userID)
			if err != nil {
				RespondError(c, http.StatusInternalServerError, "Failed to check admin status")
				return
			}
			if !isAdmin {
				RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
				return
			}
		}
	} else if conversationType == "group" {
		var isParticipant bool
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
		if !isParticipant {
			RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
			return
		}
	} else {
		// For regular DM conversations, use the existing method
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

	var messages []*models.Message

	// For mod mail and group conversations, return all messages for the conversation (all participants can view)
	if conversationType == "mod_mail" || conversationType == "group" {
		if useCursorPagination {
			var payload *models.TimeCursor
			if cursor != nil {
				payload = &models.TimeCursor{ID: cursor.ID, Timestamp: cursor.Timestamp}
			}
			messages, err = h.messageRepo.GetByConversationIDForAllWithCursor(
				c.Request.Context(),
				conversationID,
				userID,
				limitArg,
				payload,
			)
		} else {
			messages, err = h.messageRepo.GetByConversationIDForAll(
				c.Request.Context(),
				conversationID,
				userID,
				limitArg,
				offset,
			)
		}
	} else {
		if useCursorPagination {
			var payload *models.TimeCursor
			if cursor != nil {
				payload = &models.TimeCursor{ID: cursor.ID, Timestamp: cursor.Timestamp}
			}
			messages, err = h.messageRepo.GetByConversationIDWithCursor(c.Request.Context(), conversationID, userID, limitArg, payload)
		} else {
			messages, err = h.messageRepo.GetByConversationID(c.Request.Context(), conversationID, userID, limitArg, offset)
		}
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get messages")
		return
	}
	if messages == nil {
		messages = []*models.Message{}
	}

	// Mark undelivered messages as delivered for this recipient and notify senders (concurrent broadcasts)
	if h.hub != nil {
		delivered, err := h.messageRepo.MarkUndeliveredAsDelivered(c.Request.Context(), conversationID, userID)
		if err == nil {
			for _, dm := range delivered {
				// Reload message to get delivered_at timestamp
				updatedMsg, err := h.messageRepo.GetByID(c.Request.Context(), dm.ID)
				var deliveredAt interface{}
				if err == nil && updatedMsg != nil {
					deliveredAt = updatedMsg.DeliveredAt
				}

				go h.hub.Broadcast(&websocket.Message{
					RecipientID: dm.SenderID,
					Type:        "message_delivered",
					Payload: gin.H{
						"message_id":      dm.ID,
						"conversation_id": conversationID,
						"delivered_at":    deliveredAt,
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

// GetThread returns the thread root and paginated replies in chronological order.
// @Summary      Get message thread
// @Tags         Messages
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Root message ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/{id}/thread [get]
func (h *MessagesHandler) GetThread(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil || messageID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	targetMessage, err := h.messageRepo.GetByID(c.Request.Context(), messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			RespondError(c, http.StatusNotFound, "Message not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to load message")
		return
	}

	canAccess, err := h.canAccessConversation(c.Request.Context(), targetMessage.ConversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to validate conversation access")
		return
	}
	if !canAccess {
		RespondError(c, http.StatusForbidden, "You are not authorized to access this message")
		return
	}
	blocked, err := h.isSenderBlockedByViewer(c.Request.Context(), userID, targetMessage.SenderID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
		return
	}
	if blocked && targetMessage.SenderID != userID {
		RespondError(c, http.StatusNotFound, "Message not found")
		return
	}

	rootID := targetMessage.ID
	if targetMessage.ThreadRoot != nil && *targetMessage.ThreadRoot > 0 {
		rootID = *targetMessage.ThreadRoot
	}

	rootMessage := targetMessage
	if rootID != targetMessage.ID {
		rootMessage, err = h.messageRepo.GetByID(c.Request.Context(), rootID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				RespondError(c, http.StatusNotFound, "Thread root message not found")
				return
			}
			RespondError(c, http.StatusInternalServerError, "Failed to load thread root")
			return
		}
	}
	blocked, err = h.isSenderBlockedByViewer(c.Request.Context(), userID, rootMessage.SenderID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check blocking status")
		return
	}
	if blocked && rootMessage.SenderID != userID {
		// Keep thread access for a viewer-owned target message while preventing root content disclosure.
		// The target acts as a visible surrogate root in this response only.
		if targetMessage.SenderID == userID {
			rootMessage = targetMessage
		} else {
			RespondError(c, http.StatusNotFound, "Thread root message not found")
			return
		}
	}

	conversationType, err := h.getConversationType(c.Request.Context(), rootMessage.ConversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load conversation type")
		return
	}

	var countQuery string
	var idQuery string
	if conversationType == "mod_mail" {
		countQuery = `
			SELECT COUNT(*)
			FROM messages m
			WHERE m.conversation_id = $1
			  AND m.thread_root = $2
			  AND m.id <> $2
			  AND NOT (m.deleted_for_sender = TRUE AND m.deleted_for_recipient = TRUE)
			  AND NOT EXISTS (
			    SELECT 1 FROM blocked_users bu
			    WHERE bu.blocker_id = $3
			      AND bu.blocked_id = m.sender_id
			  )
		`
		idQuery = `
			SELECT m.id
			FROM messages m
			WHERE m.conversation_id = $1
			  AND m.thread_root = $2
			  AND m.id <> $2
			  AND NOT (m.deleted_for_sender = TRUE AND m.deleted_for_recipient = TRUE)
			  AND NOT EXISTS (
			    SELECT 1 FROM blocked_users bu
			    WHERE bu.blocker_id = $3
			      AND bu.blocked_id = m.sender_id
			  )
			ORDER BY m.sent_at ASC, m.id ASC
			LIMIT $4 OFFSET $5
		`
	} else {
		countQuery = `
			SELECT COUNT(*)
			FROM messages m
			WHERE m.conversation_id = $1
			  AND m.thread_root = $2
			  AND m.id <> $2
			  AND (
			    (m.sender_id = $3 AND m.deleted_for_sender = FALSE)
			    OR
			    (m.recipient_id = $3 AND m.deleted_for_recipient = FALSE)
			  )
			  AND NOT EXISTS (
			    SELECT 1 FROM blocked_users bu
			    WHERE bu.blocker_id = $3
			      AND bu.blocked_id = m.sender_id
			  )
		`
		idQuery = `
			SELECT m.id
			FROM messages m
			WHERE m.conversation_id = $1
			  AND m.thread_root = $2
			  AND m.id <> $2
			  AND (
			    (m.sender_id = $3 AND m.deleted_for_sender = FALSE)
			    OR
			    (m.recipient_id = $3 AND m.deleted_for_recipient = FALSE)
			  )
			  AND NOT EXISTS (
			    SELECT 1 FROM blocked_users bu
			    WHERE bu.blocker_id = $3
			      AND bu.blocked_id = m.sender_id
			  )
			ORDER BY m.sent_at ASC, m.id ASC
			LIMIT $4 OFFSET $5
		`
	}

	var totalReplies int
	if err := h.pool.QueryRow(c.Request.Context(), countQuery, rootMessage.ConversationID, rootID, userID).Scan(&totalReplies); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to count thread replies")
		return
	}

	rows, err := h.pool.Query(c.Request.Context(), idQuery, rootMessage.ConversationID, rootID, userID, limit, offset)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to list thread replies")
		return
	}
	defer rows.Close()

	replyIDs := make([]int, 0, limit)
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to scan thread replies")
			return
		}
		replyIDs = append(replyIDs, id)
	}
	if err := rows.Err(); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to read thread replies")
		return
	}

	replies := make([]*models.Message, 0, len(replyIDs))
	for _, id := range replyIDs {
		msg, err := h.messageRepo.GetByID(c.Request.Context(), id)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to load thread reply")
			return
		}
		replies = append(replies, msg)
	}

	c.JSON(http.StatusOK, gin.H{
		"root_message": rootMessage,
		"replies":      replies,
		"reply_count":  totalReplies,
		"muted":        h.isThreadMutedForUser(c.Request.Context(), rootID, userID),
		"limit":        limit,
		"offset":       offset,
	})
}

func (h *MessagesHandler) isThreadMutedForUser(ctx context.Context, rootID int, userID int) bool {
	var muted bool
	err := h.pool.QueryRow(ctx, `
		SELECT COALESCE(muted, false)
		FROM thread_notification_settings
		WHERE thread_root_id = $1 AND user_id = $2
	`, rootID, userID).Scan(&muted)
	if err != nil {
		return false
	}
	return muted
}

func (h *MessagesHandler) setThreadMuted(c *gin.Context, muted bool) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil || messageID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	targetMessage, err := h.messageRepo.GetByID(c.Request.Context(), messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			RespondError(c, http.StatusNotFound, "Message not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to load message")
		return
	}

	canAccess, err := h.canAccessConversation(c.Request.Context(), targetMessage.ConversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to validate conversation access")
		return
	}
	if !canAccess {
		RespondError(c, http.StatusForbidden, "You are not authorized to modify this thread")
		return
	}

	rootID := targetMessage.ID
	if targetMessage.ThreadRoot != nil && *targetMessage.ThreadRoot > 0 {
		rootID = *targetMessage.ThreadRoot
	}

	_, err = h.pool.Exec(c.Request.Context(), `
		INSERT INTO thread_notification_settings (thread_root_id, user_id, muted, updated_at)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
		ON CONFLICT (thread_root_id, user_id)
		DO UPDATE SET muted = EXCLUDED.muted, updated_at = CURRENT_TIMESTAMP
	`, rootID, userID, muted)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update thread mute setting")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":     "Thread notification setting updated",
		"thread_root": rootID,
		"muted":       muted,
	})
}

// MuteThread mutes notifications for a message thread.
// @Summary      Mute thread
// @Tags         Messages
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Root message ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/{id}/thread/mute [put]
func (h *MessagesHandler) MuteThread(c *gin.Context) {
	h.setThreadMuted(c, true)
}

// UnmuteThread unmutes a message thread.
// @Summary      Unmute thread
// @Tags         Messages
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Root message ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/{id}/thread/unmute [put]
func (h *MessagesHandler) UnmuteThread(c *gin.Context) {
	h.setThreadMuted(c, false)
}

// MarkAsRead marks all messages in a conversation as read.
// @Summary      Mark conversation as read
// @Tags         Messages
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id}/read [post]
func (h *MessagesHandler) MarkAsRead(c *gin.Context) {
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

	// Check conversation type first
	var conversationType string
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT COALESCE(conversation_type, 'dm') AS conversation_type
		FROM conversations
		WHERE id = $1
	`, conversationID).Scan(&conversationType)

	if err != nil {
		if err.Error() == "no rows in result set" {
			RespondError(c, http.StatusNotFound, "Conversation not found")
		} else {
			RespondError(c, http.StatusInternalServerError, "Failed to get conversation")
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
		`, conversationID, userID).Scan(&isParticipant)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to check participant status")
			return
		}
		if !isParticipant {
			isAdmin, err := h.isAdmin(c.Request.Context(), userID)
			if err != nil {
				RespondError(c, http.StatusInternalServerError, "Failed to check admin status")
				return
			}
			if !isAdmin {
				RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
				return
			}
		}
	} else if conversationType == "group" {
		var isParticipant bool
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
		if !isParticipant {
			RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
			return
		}
	} else {
		// For DM conversations, use the traditional method
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
	}

	// Get all unread messages before marking as read, so we can send individual events
	query := `
		SELECT id, sender_id
		FROM messages
		WHERE conversation_id = $1
		  AND recipient_id = $2
		  AND read_at IS NULL
		  AND deleted_for_recipient = false
		  AND NOT EXISTS (
		    SELECT 1 FROM blocked_users bu
		    WHERE bu.blocker_id = $2
		      AND bu.blocked_id = messages.sender_id
		  )
	`
	rows, err := h.pool.Query(c.Request.Context(), query, conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get unread messages")
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
			RespondError(c, http.StatusInternalServerError, "Failed to scan messages")
			return
		}
		unreadMessages = append(unreadMessages, msg)
	}

	// Check if user has read receipts enabled before marking as read
	userSettings, err := h.userSettingsRepo.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get user settings")
		return
	}

	// If settings don't exist, create defaults (which have read receipts enabled by default)
	if userSettings == nil {
		userSettings, err = h.userSettingsRepo.CreateDefault(c.Request.Context(), userID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to create user settings")
			return
		}
	}

	// If user has disabled read receipts, return success without marking as read or broadcasting
	if !userSettings.ShowReadReceipts {
		log.Printf("[MarkAsRead] User %d has read receipts disabled, skipping read receipt update", userID)
		c.JSON(http.StatusOK, gin.H{"message": "Read receipts disabled"})
		return
	}

	// Mark all messages as read for this user
	if err := h.messageRepo.MarkAllAsRead(c.Request.Context(), conversationID, userID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to mark messages as read")
		return
	}

	// Reload messages to get read_at timestamps
	updatedMessages := make(map[int]interface{})
	for _, msg := range unreadMessages {
		if updated, err := h.messageRepo.GetByID(c.Request.Context(), msg.ID); err == nil && updated != nil {
			updatedMessages[msg.ID] = updated.ReadAt
		}
	}

	// Notify senders about individual message read events (concurrent for better performance)
	if h.hub != nil {
		for _, msg := range unreadMessages {
			readAt := updatedMessages[msg.ID]
			go h.hub.Broadcast(&websocket.Message{
				RecipientID: msg.SenderID,
				Type:        "message_read",
				Payload: gin.H{
					"message_id":      msg.ID,
					"conversation_id": conversationID,
					"reader_id":       userID,
					"read_at":         readAt,
				},
			})
		}

		// Notify other participants based on conversation type
		if conversationType == "mod_mail" {
			// For mod mail, notify all participants except the reader (concurrent broadcasts)
			rows, err := h.pool.Query(c.Request.Context(), `
				SELECT user_id FROM conversation_participants
				WHERE conversation_id = $1 AND user_id != $2
			`, conversationID, userID)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var participantID int
					if rows.Scan(&participantID) == nil {
						go h.hub.Broadcast(&websocket.Message{
							RecipientID: participantID,
							Type:        "conversation_read",
							Payload: gin.H{
								"conversation_id": conversationID,
								"reader_id":       userID,
							},
						})
					}
				}
			}
		} else {
			// For DM conversations, notify the other participant
			conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
			if err == nil && conversation != nil {
				otherUserID := conversation.GetOtherUserID(userID)
				if otherUserID != 0 {
					h.hub.Broadcast(&websocket.Message{
						RecipientID: otherUserID,
						Type:        "conversation_read",
						Payload: gin.H{
							"conversation_id": conversationID,
							"reader_id":       userID,
						},
					})
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Messages marked as read"})
}

// MarkSingleMessageAsRead marks a single message as read.
// @Summary      Mark single message as read
// @Tags         Messages
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Message ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/{id}/read [post]
func (h *MessagesHandler) MarkSingleMessageAsRead(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	// Get message to verify user is the recipient
	message, err := h.messageRepo.GetByID(c.Request.Context(), messageID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get message")
		return
	}

	if message == nil {
		RespondError(c, http.StatusNotFound, "Message not found")
		return
	}

	// System messages are informational; read-receipt semantics don't apply.
	if message.MessageType == "system" {
		c.JSON(http.StatusOK, gin.H{"message": "System messages do not have read receipts"})
		return
	}

	// Only the recipient can mark a message as read
	if message.RecipientID != userID {
		RespondError(c, http.StatusForbidden, "You can only mark your own received messages as read")
		return
	}

	// Check if already read
	if message.ReadAt != nil {
		c.JSON(http.StatusOK, gin.H{"message": "Message already marked as read"})
		return
	}

	// Check if user has read receipts enabled before marking as read
	userSettings, err := h.userSettingsRepo.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get user settings")
		return
	}

	// If settings don't exist, create defaults (which have read receipts enabled by default)
	if userSettings == nil {
		userSettings, err = h.userSettingsRepo.CreateDefault(c.Request.Context(), userID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to create user settings")
			return
		}
	}

	// If user has disabled read receipts, return success without marking as read or broadcasting
	if !userSettings.ShowReadReceipts {
		log.Printf("[MarkSingleMessageAsRead] User %d has read receipts disabled, skipping read receipt update", userID)
		c.JSON(http.StatusOK, gin.H{"message": "Read receipts disabled"})
		return
	}

	// Mark message as read
	if err := h.messageRepo.MarkAsRead(c.Request.Context(), messageID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to mark message as read")
		return
	}

	// Reload to get read_at timestamp
	updatedMsg, err := h.messageRepo.GetByID(c.Request.Context(), messageID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to reload message")
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
				"reader_id":       userID,
				"read_at":         updatedMsg.ReadAt,
			},
		})
	}

	c.JSON(http.StatusOK, gin.H{"message": "Message marked as read"})
}

// DeleteMessage deletes a message.
// @Summary      Delete message
// @Tags         Messages
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Message ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/{id} [delete]
func (h *MessagesHandler) DeleteMessage(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	deleteScope := strings.ToLower(strings.TrimSpace(c.DefaultQuery("delete_for", "self")))
	if deleteScope == "" {
		deleteScope = "self"
	}
	if deleteScope != "self" && deleteScope != "both" {
		RespondError(c, http.StatusBadRequest, "Invalid delete_for value. Must be 'self' or 'both'")
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	// Get message to verify user is a participant
	message, err := h.messageRepo.GetByID(c.Request.Context(), messageID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get message")
		return
	}

	if message == nil {
		RespondError(c, http.StatusNotFound, "Message not found")
		return
	}

	if !message.IsParticipant(userID) {
		RespondError(c, http.StatusForbidden, "You are not a participant in this message")
		return
	}

	if deleteScope == "both" {
		if message.SenderID != userID {
			RespondError(c, http.StatusForbidden, "Only the message sender can delete for both users")
			return
		}

		if err := h.messageRepo.SoftDeleteForBoth(c.Request.Context(), messageID); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to delete message for both users")
			return
		}
	} else {
		// Soft delete for this user
		if err := h.messageRepo.SoftDeleteForUser(c.Request.Context(), messageID, userID); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to delete message")
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

// PinMessage pins a message in a conversation.
// @Summary      Pin message
// @Tags         Messages
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Message ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/{id}/pin [post]
func (h *MessagesHandler) PinMessage(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	var conversationID int
	var isPinned bool
	var encryptedContent string
	var messageType string
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT conversation_id, pinned, encrypted_content, message_type
		FROM messages
		WHERE id = $1
	`, messageID).Scan(&conversationID, &isPinned, &encryptedContent, &messageType)
	if err != nil {
		if err.Error() == "no rows in result set" {
			RespondError(c, http.StatusNotFound, "Message not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to load message")
		return
	}

	canAccess, err := h.canAccessConversation(c.Request.Context(), conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to verify conversation access")
		return
	}
	if !canAccess {
		RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}

	if isPinned {
		c.JSON(http.StatusOK, gin.H{"message": "Message already pinned"})
		return
	}

	var pinnedAt time.Time
	err = h.pool.QueryRow(c.Request.Context(), `
		UPDATE messages
		SET pinned = TRUE, pinned_by = $2, pinned_at = NOW()
		WHERE id = $1
		RETURNING pinned_at
	`, messageID, userID).Scan(&pinnedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.ConstraintName == "messages_max_pinned_per_conversation" {
			RespondError(c, http.StatusConflict, "Conversation already has maximum pinned messages (10)")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to pin message")
		return
	}

	h.broadcastPinEvent(
		c.Request.Context(),
		conversationID,
		"message_pinned",
		messageID,
		&userID,
		&pinnedAt,
		messageType,
		encryptedContent,
	)

	c.JSON(http.StatusOK, gin.H{"message": "Message pinned"})
}

// UnpinMessage unpins a message.
// @Summary      Unpin message
// @Tags         Messages
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Message ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /messages/{id}/pin [delete]
func (h *MessagesHandler) UnpinMessage(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	var conversationID int
	var isPinned bool
	var pinnedBy *int
	var pinnedAt *time.Time
	var encryptedContent string
	var messageType string
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT conversation_id, pinned, pinned_by, pinned_at, encrypted_content, message_type
		FROM messages
		WHERE id = $1
	`, messageID).Scan(&conversationID, &isPinned, &pinnedBy, &pinnedAt, &encryptedContent, &messageType)
	if err != nil {
		if err.Error() == "no rows in result set" {
			RespondError(c, http.StatusNotFound, "Message not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to load message")
		return
	}

	canAccess, err := h.canAccessConversation(c.Request.Context(), conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to verify conversation access")
		return
	}
	if !canAccess {
		isAdmin, adminErr := h.isAdmin(c.Request.Context(), userID)
		if adminErr != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to verify unpin permissions")
			return
		}
		if !isAdmin {
			RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
			return
		}
	}

	if !isPinned {
		c.JSON(http.StatusOK, gin.H{"message": "Message already unpinned"})
		return
	}

	isAdmin, err := h.isAdmin(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to verify unpin permissions")
		return
	}
	if pinnedBy == nil || (*pinnedBy != userID && !isAdmin) {
		RespondError(c, http.StatusForbidden, "Only the pinner or an admin can unpin this message")
		return
	}

	_, err = h.pool.Exec(c.Request.Context(), `
		UPDATE messages
		SET pinned = FALSE, pinned_by = NULL, pinned_at = NULL
		WHERE id = $1
	`, messageID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unpin message")
		return
	}

	h.broadcastPinEvent(
		c.Request.Context(),
		conversationID,
		"message_unpinned",
		messageID,
		pinnedBy,
		pinnedAt,
		messageType,
		encryptedContent,
	)

	c.JSON(http.StatusOK, gin.H{"message": "Message unpinned"})
}

// GetPinnedMessages returns pinned messages for a conversation.
// @Summary      Get pinned messages
// @Tags         Messages
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id}/pinned-messages [get]
func (h *MessagesHandler) GetPinnedMessages(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	conversationType, err := h.getConversationType(c.Request.Context(), conversationID)
	if err != nil {
		if err.Error() == "no rows in result set" {
			RespondError(c, http.StatusNotFound, "Conversation not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to load conversation")
		return
	}

	canAccess, err := h.canAccessConversation(c.Request.Context(), conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to verify conversation access")
		return
	}
	if !canAccess {
		RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}

	query := `
		SELECT m.id, m.conversation_id, m.sender_id, m.recipient_id, m.encrypted_content,
		       m.sender_encrypted_content,
		       m.message_type, m.sent_at, m.delivered_at, m.read_at,
		       m.pinned, m.pinned_by, m.pinned_at,
		       m.deleted_for_sender, m.deleted_for_recipient,
		       m.media_file_id,
		       COALESCE(mf.storage_url, m.media_url) as media_url,
		       COALESCE(m.media_type, mf.file_type) as media_type,
		       COALESCE(m.media_size, mf.file_size) as media_size,
		       m.encryption_version,
		       m.media_encryption_key,
		       m.media_encryption_iv,
		       m.sender_media_encryption_key,
		       COALESCE(m.is_multi_recipient, FALSE) as is_multi_recipient,
		       m.shared_encryption_iv,
		       EXISTS (SELECT 1 FROM message_reactions mr WHERE mr.message_id = m.id) AS has_reactions
		FROM messages m
		LEFT JOIN media_files mf ON m.media_file_id = mf.id
		WHERE m.conversation_id = $1
		  AND m.pinned = TRUE
	`

	var rows pgx.Rows
	if conversationType == "mod_mail" {
		query += `
		  AND NOT (m.deleted_for_sender = TRUE AND m.deleted_for_recipient = TRUE)
		  AND NOT EXISTS (
		    SELECT 1 FROM blocked_users bu
		    WHERE bu.blocker_id = $2
		      AND bu.blocked_id = m.sender_id
		  )
		  ORDER BY m.pinned_at ASC, m.id ASC
		  LIMIT 10
		`
		rows, err = h.pool.Query(c.Request.Context(), query, conversationID, userID)
	} else {
		query += `
		  AND (
		    (m.sender_id = $2 AND m.deleted_for_sender = false) OR
		    (m.recipient_id = $2 AND m.deleted_for_recipient = false)
		  )
		  AND NOT EXISTS (
		    SELECT 1 FROM blocked_users bu
		    WHERE bu.blocker_id = $2
		      AND bu.blocked_id = m.sender_id
		  )
		  ORDER BY m.pinned_at ASC, m.id ASC
		  LIMIT 10
		`
		rows, err = h.pool.Query(c.Request.Context(), query, conversationID, userID)
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get pinned messages")
		return
	}
	defer rows.Close()

	messages := make([]*models.Message, 0, 10)
	for rows.Next() {
		message := &models.Message{}
		err = rows.Scan(
			&message.ID,
			&message.ConversationID,
			&message.SenderID,
			&message.RecipientID,
			&message.EncryptedContent,
			&message.SenderEncryptedContent,
			&message.MessageType,
			&message.SentAt,
			&message.DeliveredAt,
			&message.ReadAt,
			&message.Pinned,
			&message.PinnedBy,
			&message.PinnedAt,
			&message.DeletedForSender,
			&message.DeletedForRecipient,
			&message.MediaFileID,
			&message.MediaURL,
			&message.MediaType,
			&message.MediaSize,
			&message.EncryptionVersion,
			&message.MediaEncryptionKey,
			&message.MediaEncryptionIV,
			&message.SenderMediaEncryptionKey,
			&message.IsMultiRecipient,
			&message.SharedEncryptionIV,
			&message.HasReactions,
		)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to read pinned messages")
			return
		}
		messages = append(messages, message)
	}
	if err := rows.Err(); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to iterate pinned messages")
		return
	}

	c.JSON(http.StatusOK, gin.H{"pinned_messages": messages})
}

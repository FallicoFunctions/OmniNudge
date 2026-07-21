package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// OmniChatHandler handles HTTP requests for OmniChat bot personas and conversations.
type OmniChatHandler struct {
	personaRepo    *models.BotPersonaRepository
	convRepo       *models.BotConversationRepository
	messageRepo    *models.BotMessageRepository
	chatbotService *services.ChatbotService
}

// NewOmniChatHandler creates a new OmniChat handler.
func NewOmniChatHandler(
	personaRepo *models.BotPersonaRepository,
	convRepo *models.BotConversationRepository,
	messageRepo *models.BotMessageRepository,
	chatbotService *services.ChatbotService,
) *OmniChatHandler {
	return &OmniChatHandler{
		personaRepo:    personaRepo,
		convRepo:       convRepo,
		messageRepo:    messageRepo,
		chatbotService: chatbotService,
	}
}

// ListPersonas returns the active bot persona catalog, optionally filtered by ?category=.
func (h *OmniChatHandler) ListPersonas(c *gin.Context) {
	var viewerUserID *int
	if userID, ok := middleware.GetOptionalUserID(c); ok {
		viewerUserID = &userID
	}

	personas, err := h.personaRepo.ListCatalog(c.Request.Context(), c.Query("category"), viewerUserID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to list personas")
		return
	}
	c.JSON(http.StatusOK, gin.H{"personas": personas})
}

// OmniChatCreateConversationRequest is the request body for starting a new OmniChat conversation.
type OmniChatCreateConversationRequest struct {
	PersonaID int                          `json:"persona_id" binding:"required"`
	Title     *string                      `json:"title"`
	ForceNew  bool                         `json:"force_new"`
	Settings  *models.ConversationSettings `json:"settings,omitempty"`
	Messages  []*models.BotMessage         `json:"messages,omitempty"`
}

// CreateConversation starts a new conversation between the current user and a persona.
func (h *OmniChatHandler) CreateConversation(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req OmniChatCreateConversationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	settings, err := normalizeConversationSettings(req.Settings)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation settings")
		return
	}
	messages, err := normalizeImportedMessages(req.Messages)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid imported messages")
		return
	}
	title, err := normalizeConversationTitle(req.Title)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation title")
		return
	}

	persona, err := h.personaRepo.GetAccessibleByID(c.Request.Context(), req.PersonaID, &userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to look up persona")
		return
	}
	if persona == nil || !persona.IsActive {
		RespondError(c, http.StatusNotFound, "Persona not found")
		return
	}

	// Persist the starter turn in the same transaction as the conversation.
	// Previously a failed follow-up insert still returned 201 with a partially
	// initialized conversation.
	initialMessages := messages
	if len(initialMessages) == 0 {
		if starter := h.chatbotService.BuildStarterMessage(persona); starter != "" {
			initialMessages = []*models.BotMessage{{
				Role:    models.BotMessageRoleAssistant,
				Content: starter,
			}}
		}
	}
	var conversation *models.BotConversation
	var reused bool
	if req.ForceNew {
		conversation, err = h.convRepo.CreateWithMessages(c.Request.Context(), userID, req.PersonaID, title, settings, initialMessages)
	} else {
		conversation, reused, err = h.convRepo.GetOrCreateActiveWithMessages(c.Request.Context(), userID, req.PersonaID, title, settings, initialMessages)
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create conversation")
		return
	}

	conversation.Persona = persona
	if reused {
		c.JSON(http.StatusOK, conversation)
		return
	}
	c.JSON(http.StatusCreated, conversation)
}

// ListConversations returns the current user's OmniChat conversations.
// When ?persona_id= is provided, only conversations with that persona are returned.
func (h *OmniChatHandler) ListConversations(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	limit := 50
	offset := 0
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 && v <= 100 {
		limit = v
	}
	if v, err := strconv.Atoi(c.Query("offset")); err == nil && v >= 0 {
		offset = v
	}

	if personaIDStr := c.Query("persona_id"); personaIDStr != "" {
		personaID, err := strconv.Atoi(personaIDStr)
		if err != nil || personaID <= 0 {
			RespondError(c, http.StatusBadRequest, "Invalid persona_id")
			return
		}
		conversations, err := h.convRepo.ListByUserIDAndPersonaID(c.Request.Context(), userID, personaID, limit, offset)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to list conversations")
			return
		}
		c.JSON(http.StatusOK, gin.H{"conversations": conversations})
		return
	}

	conversations, err := h.convRepo.ListByUserID(c.Request.Context(), userID, limit, offset)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to list conversations")
		return
	}
	c.JSON(http.StatusOK, gin.H{"conversations": conversations})
}

// DeleteConversation soft-deletes (archives) an OmniChat conversation.
func (h *OmniChatHandler) DeleteConversation(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation id")
		return
	}

	archived, err := h.convRepo.Archive(c.Request.Context(), conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to archive conversation")
		return
	}
	if !archived {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "conversation archived"})
}

// DeletePersonaConversations soft-deletes every active conversation the user
// has with one OmniChat persona.
func (h *OmniChatHandler) DeletePersonaConversations(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	personaID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid persona id")
		return
	}

	persona, err := h.personaRepo.GetAccessibleByID(c.Request.Context(), personaID, &userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load persona")
		return
	}
	if persona == nil {
		RespondError(c, http.StatusNotFound, "Persona not found")
		return
	}

	archivedCount, err := h.convRepo.ArchiveByUserAndPersonaID(c.Request.Context(), userID, personaID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to archive conversations")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "conversations archived", "archived_count": archivedCount})
}

// OmniChatUpdateSettingsRequest is the request body for updating conversation settings.
type OmniChatUpdateSettingsRequest struct {
	Settings models.ConversationSettings `json:"settings" binding:"required"`
}

// UpdateConversationSettings updates the per-conversation user settings.
func (h *OmniChatHandler) UpdateConversationSettings(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	// Verify ownership
	conv, err := h.convRepo.GetByID(c.Request.Context(), conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load conversation")
		return
	}
	if conv == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}

	var req OmniChatUpdateSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	settings, err := normalizeConversationSettings(&req.Settings)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation settings")
		return
	}

	updated, err := h.convRepo.UpdateSettings(c.Request.Context(), conversationID, userID, settings)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update settings")
		return
	}
	if !updated {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}

	c.JSON(http.StatusOK, gin.H{"settings": settings})
}

// ForkConversation creates a new conversation copying all messages from the current one.
func (h *OmniChatHandler) ForkConversation(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	original, err := h.convRepo.GetByID(c.Request.Context(), conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load conversation")
		return
	}
	if original == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}

	// Load persona to populate on the new conversation
	persona, err := h.personaRepo.GetAccessibleByID(c.Request.Context(), original.PersonaID, &userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load persona")
		return
	}
	if persona == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}
	original.Persona = persona

	newConv, err := h.convRepo.ForkConversation(c.Request.Context(), userID, original)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fork conversation")
		return
	}

	newConv.Persona = persona
	c.JSON(http.StatusCreated, newConv)
}

// GetConversation returns a single conversation with its message history and settings.
func (h *OmniChatHandler) GetConversation(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	conversation, err := h.convRepo.GetByID(c.Request.Context(), conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load conversation")
		return
	}
	if conversation == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}

	persona, err := h.personaRepo.GetAccessibleByID(c.Request.Context(), conversation.PersonaID, &userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load persona")
		return
	}
	if persona == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}
	conversation.Persona = persona

	messages, err := h.messageRepo.ListByConversationID(c.Request.Context(), conversationID, 200)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load messages")
		return
	}
	if repaired, err := h.messageRepo.RepairStaleDanglingUserTurn(
		c.Request.Context(),
		conversationID,
		services.StaleDanglingOmniChatTurnAfter,
		services.InterruptedOmniChatReply,
	); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to repair interrupted message")
		return
	} else if repaired != nil {
		if err := h.convRepo.UpdateLastMessageAt(c.Request.Context(), conversationID); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to update conversation activity")
			return
		}
		messages, err = h.messageRepo.ListByConversationID(c.Request.Context(), conversationID, 200)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to load messages")
			return
		}
	}
	decorateOmniChatMessageAttachments(messages, userID)

	c.JSON(http.StatusOK, gin.H{"conversation": conversation, "messages": messages})
}

func decorateOmniChatMessageAttachments(messages []*models.BotMessage, viewerUserID int) {
	for _, message := range messages {
		for _, asset := range message.Attachments {
			if asset.OwnerUserID == viewerUserID {
				asset.ContentURL = "/api/v1/omnichat/media/" + asset.ID.String() + "/content"
				asset.ThumbnailURL = nil
				continue
			}
			// Continued public chat snapshots may reference an attachment owned
			// by the original author. Keep access behind the publication-aware
			// endpoint so removal, blocks, NSFW settings, and bans still apply.
			asset.ContentURL = "/api/v1/omnichat/explore/media/" + asset.ID.String() + "/content"
			asset.ThumbnailURL = nil
		}
	}
}

// OmniChatSendMessageRequest is the request body for sending a message in an OmniChat conversation.
type OmniChatSendMessageRequest struct {
	Content string `json:"content" binding:"required"`
}

// SendMessage sends a user message and generates the persona's reply.
// The reply also streams token-by-token over the WebSocket hub; this
// response carries the final, complete assistant message.
func (h *OmniChatHandler) SendMessage(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	var req OmniChatSendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	content, err := normalizeOmniChatContent(req.Content)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message content")
		return
	}

	assistantMsg, err := h.chatbotService.SendMessage(c.Request.Context(), userID, conversationID, content)
	if err != nil {
		if errors.Is(err, services.ErrNotFound) {
			RespondError(c, http.StatusNotFound, "Conversation not found")
			return
		}
		if assistantMsg != nil {
			// Generation failed but the exchange was persisted (assistantMsg.Failed
			// is set with safe, user-facing copy) — return it rather than a 500.
			c.JSON(http.StatusOK, assistantMsg)
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to send message")
		return
	}

	c.JSON(http.StatusOK, assistantMsg)
}

// RegenerateMessage replaces the latest assistant reply with a newly
// generated version. The service preserves the original reply on failure.
func (h *OmniChatHandler) RegenerateMessage(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil || conversationID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}
	messageID, err := strconv.Atoi(c.Param("message_id"))
	if err != nil || messageID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	message, err := h.chatbotService.RegenerateMessage(
		c.Request.Context(),
		userID,
		conversationID,
		messageID,
	)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNotFound):
			RespondError(c, http.StatusNotFound, "Conversation not found")
		case errors.Is(err, services.ErrMessageNotRegeneratable):
			RespondError(c, http.StatusConflict, "Only the latest assistant reply can be regenerated")
		default:
			RespondError(c, http.StatusBadGateway, "Failed to regenerate reply")
		}
		return
	}

	c.JSON(http.StatusOK, message)
}

type editAssistantMessageRequest struct {
	Content string `json:"content" binding:"required"`
}

// EditAssistantMessage lets a user correct the latest assistant reply in an
// owned conversation. The previous text is retained in private edit history.
func (h *OmniChatHandler) EditAssistantMessage(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil || conversationID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}
	messageID, err := strconv.Atoi(c.Param("message_id"))
	if err != nil || messageID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}
	var req editAssistantMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Message content is required")
		return
	}
	content, err := normalizeOmniChatContent(req.Content)
	if err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}
	message, err := h.chatbotService.EditAssistantMessage(c.Request.Context(), userID, conversationID, messageID, content)
	if err != nil {
		if errors.Is(err, services.ErrMessageNotEditable) {
			RespondError(c, http.StatusConflict, "Only the latest assistant reply can be edited")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to edit reply")
		return
	}
	c.JSON(http.StatusOK, message)
}

// previewMessage is a single ephemeral turn sent by the frontend.
type previewMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// OmniChatPreviewMessageRequest is the request body for ephemeral preview messages.
type OmniChatPreviewMessageRequest struct {
	PersonaID int              `json:"persona_id" binding:"required"`
	Content   string           `json:"content" binding:"required"`
	History   []previewMessage `json:"history"`
}

// PreviewSendMessage generates an ephemeral reply without persisting a conversation.
func (h *OmniChatHandler) PreviewSendMessage(c *gin.Context) {
	var req OmniChatPreviewMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	content, err := normalizeOmniChatContent(req.Content)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message content")
		return
	}

	history, err := normalizePreviewHistory(req.History)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message history")
		return
	}

	var viewerUserID *int
	if userID, ok := middleware.GetOptionalUserID(c); ok {
		viewerUserID = &userID
	}

	fullText, failed, err := h.chatbotService.SendPreviewMessage(c.Request.Context(), req.PersonaID, viewerUserID, content, history)
	if err != nil && fullText == "" {
		if errors.Is(err, services.ErrNotFound) {
			RespondError(c, http.StatusNotFound, "Persona not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to generate reply")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"role":    "assistant",
		"content": fullText,
		"failed":  failed,
	})
}

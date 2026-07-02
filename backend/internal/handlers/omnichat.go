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
	personas, err := h.personaRepo.ListActive(c.Request.Context(), c.Query("category"))
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
	Messages  []*models.BotMessage        `json:"messages,omitempty"`
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

	persona, err := h.personaRepo.GetByID(c.Request.Context(), req.PersonaID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to look up persona")
		return
	}
	if persona == nil || !persona.IsActive {
		RespondError(c, http.StatusNotFound, "Persona not found")
		return
	}

	// Reuse an existing active conversation for this persona unless force_new
	// is set (e.g. user clicked "New Chat").
	if !req.ForceNew {
		if existing, err := h.convRepo.GetActiveByUserAndPersonaID(c.Request.Context(), userID, req.PersonaID); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to look up conversation")
			return
		} else if existing != nil {
			existing.Persona = persona
			c.JSON(http.StatusOK, existing)
			return
		}
	}

	conversation, err := h.convRepo.CreateWithMessages(c.Request.Context(), userID, req.PersonaID, req.Title, settings, messages)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create conversation")
		return
	}

	conversation.Persona = persona
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
		if err != nil {
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

	if err := h.convRepo.UpdateSettings(c.Request.Context(), conversationID, settings); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update settings")
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
	persona, err := h.personaRepo.GetByID(c.Request.Context(), original.PersonaID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load persona")
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

	persona, err := h.personaRepo.GetByID(c.Request.Context(), conversation.PersonaID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load persona")
		return
	}
	conversation.Persona = persona

	messages, err := h.messageRepo.ListByConversationID(c.Request.Context(), conversationID, 200)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load messages")
		return
	}

	c.JSON(http.StatusOK, gin.H{"conversation": conversation, "messages": messages})
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

// anonymousMessage is a single turn sent by the frontend in an anonymous
// chat request. Mirrors openrouter.Message's JSON shape.
type anonymousMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// OmniChatAnonymousMessageRequest is the request body for anonymous chat messages.
type OmniChatAnonymousMessageRequest struct {
	PersonaID int                `json:"persona_id" binding:"required"`
	Content   string             `json:"content" binding:"required"`
	History   []anonymousMessage `json:"history"`
}

// AnonymousSendMessage handles guest chat messages without authentication or persistence.
func (h *OmniChatHandler) AnonymousSendMessage(c *gin.Context) {
	var req OmniChatAnonymousMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	content, err := normalizeOmniChatContent(req.Content)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message content")
		return
	}

	history, err := normalizeAnonymousHistory(req.History)
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message history")
		return
	}

	fullText, failed, err := h.chatbotService.SendAnonymousMessage(c.Request.Context(), req.PersonaID, content, history)
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

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
	PersonaID int     `json:"persona_id" binding:"required"`
	Title     *string `json:"title"`
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

	persona, err := h.personaRepo.GetByID(c.Request.Context(), req.PersonaID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to look up persona")
		return
	}
	if persona == nil || !persona.IsActive {
		RespondError(c, http.StatusNotFound, "Persona not found")
		return
	}

	// Reuse an existing active conversation for this persona instead of
	// starting a duplicate thread every time the user picks the same tile.
	if existing, err := h.convRepo.GetActiveByUserAndPersonaID(c.Request.Context(), userID, req.PersonaID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to look up conversation")
		return
	} else if existing != nil {
		existing.Persona = persona
		c.JSON(http.StatusOK, existing)
		return
	}

	conversation, err := h.convRepo.Create(c.Request.Context(), userID, req.PersonaID, req.Title)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create conversation")
		return
	}
	conversation.Persona = persona

	c.JSON(http.StatusCreated, conversation)
}

// ListConversations returns the current user's OmniChat conversations.
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

	conversations, err := h.convRepo.ListByUserID(c.Request.Context(), userID, limit, offset)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to list conversations")
		return
	}
	c.JSON(http.StatusOK, gin.H{"conversations": conversations})
}

// GetConversation returns a single conversation with its message history.
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

	assistantMsg, err := h.chatbotService.SendMessage(c.Request.Context(), userID, conversationID, req.Content)
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

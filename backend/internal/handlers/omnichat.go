package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/api/middleware"
	apiresponse "github.com/omninudge/backend/internal/api/response"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	zlog "github.com/rs/zerolog/log"
)

// OmniChatHandler handles HTTP requests for OmniChat bot personas and conversations.
type OmniChatHandler struct {
	personaRepo    *models.BotPersonaRepository
	convRepo       *models.BotConversationRepository
	messageRepo    *models.BotMessageRepository
	chatbotService *services.ChatbotService
	modelSelection *services.OmniChatModelSelectionService
	allowance      *services.OmniChatAllowance
	idempotency    OmniChatRequestIdempotencyStore
	replies        *services.OmniChatReplyScheduler
	iaiCreator     OmniChatIAIMaker
	creationLimits *services.OmniChatCreationLimits
}

// SetCreationLimits installs how many characters a plan may keep.
func (h *OmniChatHandler) SetCreationLimits(limits *services.OmniChatCreationLimits) *OmniChatHandler {
	h.creationLimits = limits
	return h
}

// roleplayLimit is how many roleplay characters this account may own.
//
// Unset, it returns zero, which refuses every creation rather than allowing
// every creation. A handler wired without its limits should stop the feature
// loudly, not hand out unlimited characters quietly.
// respondRoleplayLimit tells somebody which refusal this is.
//
// A limit of zero is not a full shelf. It is a feature the account does not
// have, and "delete one to make room" is impossible advice for somebody with
// none. Making characters is a paid feature outright: free accounts get zero of
// either kind, and an independent one needs premium on top of that.
func respondRoleplayLimit(c *gin.Context, limit int) {
	if limit <= 0 {
		RespondErrorCoded(c, http.StatusForbidden, "character_creation_requires_upgrade",
			"Writing your own characters is part of a paid plan.")
		return
	}
	// Coded, so the interface can offer the upgrade or the delete rather than
	// reporting a failure somebody cannot act on.
	RespondErrorCoded(c, http.StatusConflict, "character_limit_reached",
		"You have as many characters as your plan allows. Delete one, or upgrade for more.")
}

func (h *OmniChatHandler) roleplayLimit(ctx context.Context, userID int) int {
	if h.creationLimits == nil {
		return 0
	}
	return h.creationLimits.RoleplayLimit(ctx, userID)
}

// SetReplyScheduler hands the handler somewhere to put a turn it has accepted
// but is not going to answer on this request.
func (h *OmniChatHandler) SetReplyScheduler(replies *services.OmniChatReplyScheduler) *OmniChatHandler {
	h.replies = replies
	return h
}

// OmniChatAcceptedTurn is what sending a message returns now: confirmation that
// the turn was recorded, not the answer to it. The answer arrives over the
// websocket when she gets to it, which may be after this response is long gone.
type OmniChatAcceptedTurn struct {
	Accepted    bool               `json:"accepted"`
	UserMessage *models.BotMessage `json:"user_message,omitempty"`
}

type OmniChatRequestIdempotencyStore interface {
	Begin(context.Context, int, uuid.UUID, string, string, string) (*models.OmniChatRequestClaim, error)
	Complete(context.Context, int, uuid.UUID, json.RawMessage) error
	Fail(context.Context, int, uuid.UUID) error
}

// NewOmniChatHandler creates a new OmniChat handler.
func NewOmniChatHandler(
	personaRepo *models.BotPersonaRepository,
	convRepo *models.BotConversationRepository,
	messageRepo *models.BotMessageRepository,
	chatbotService *services.ChatbotService,
	modelSelection *services.OmniChatModelSelectionService,
	allowances ...*services.OmniChatAllowance,
) *OmniChatHandler {
	var allowance *services.OmniChatAllowance
	if len(allowances) > 0 {
		allowance = allowances[0]
	}
	return &OmniChatHandler{
		personaRepo:    personaRepo,
		convRepo:       convRepo,
		messageRepo:    messageRepo,
		chatbotService: chatbotService,
		modelSelection: modelSelection,
		allowance:      allowance,
	}
}

func (h *OmniChatHandler) SetRequestIdempotency(store OmniChatRequestIdempotencyStore) *OmniChatHandler {
	h.idempotency = store
	return h
}

func (h *OmniChatHandler) GetAllowance(c *gin.Context) {
	state, err := inspectOmniChatAllowance(c, h.allowance)
	if err != nil {
		RespondError(c, http.StatusServiceUnavailable, "Chat allowance is temporarily unavailable")
		return
	}
	writeOmniChatAllowanceHeaders(c, state)
	c.JSON(http.StatusOK, state)
}

type OmniChatSetModelSelectionRequest struct {
	ConversationID int    `json:"conversation_id" binding:"required,min=1"`
	ModelKey       string `json:"model_key" binding:"required"`
	Scope          string `json:"scope" binding:"required"`
}

func (h *OmniChatHandler) GetModelSelection(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	conversationID, err := strconv.Atoi(c.Query("conversation_id"))
	if err != nil || conversationID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}
	selection, err := h.modelSelection.Get(c.Request.Context(), userID, conversationID)
	if err != nil {
		if errors.Is(err, models.ErrOmniChatConversationNotOwned) {
			RespondError(c, http.StatusNotFound, "Conversation not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to load model selection")
		return
	}
	c.JSON(http.StatusOK, selection)
}

func (h *OmniChatHandler) SetModelSelection(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	var req OmniChatSetModelSelectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid model selection")
		return
	}
	selection, err := h.modelSelection.Set(c.Request.Context(), userID, req.ConversationID, req.ModelKey, req.Scope)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrInvalidOmniChatModelSelection):
			RespondError(c, http.StatusBadRequest, "Invalid model selection")
		case errors.Is(err, services.ErrOmniChatModelUpgradeRequired):
			RespondError(c, http.StatusForbidden, "This model requires a plan upgrade")
		case errors.Is(err, models.ErrOmniChatConversationNotOwned):
			RespondError(c, http.StatusNotFound, "Conversation not found")
		default:
			RespondError(c, http.StatusInternalServerError, "Failed to update model selection")
		}
		return
	}
	c.JSON(http.StatusOK, selection)
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

	messages, hasMore, err := h.messageRepo.ListByConversationIDBefore(c.Request.Context(), conversationID, 0, omniChatTranscriptPageSize)
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
		messages, hasMore, err = h.messageRepo.ListByConversationIDBefore(c.Request.Context(), conversationID, 0, omniChatTranscriptPageSize)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to load messages")
			return
		}
	}
	decorateOmniChatMessageAttachments(messages, userID)

	c.JSON(http.StatusOK, gin.H{
		"conversation": conversation,
		"messages":     messages,
		"has_more":     hasMore,
	})
}

// omniChatTranscriptPageSize is how much transcript one request carries. It is
// a page now rather than a ceiling: what falls outside it is reachable through
// ListOlderMessages instead of being unreachable.
const omniChatTranscriptPageSize = 200

// ListOlderMessages walks back through a conversation. A person expects to
// scroll a chat back to its beginning however old it is, and every message has
// always been stored -- there was simply no request that could ask for one past
// the newest page.
func (h *OmniChatHandler) ListOlderMessages(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil || conversationID < 1 {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	// Ownership is checked before anything is read. The cursor is a message id
	// supplied by the caller, so without this a guessed id would page through
	// somebody else's conversation.
	conversation, err := h.convRepo.GetByID(c.Request.Context(), conversationID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load conversation")
		return
	}
	if conversation == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}

	beforeID, err := strconv.Atoi(c.Query("before"))
	if err != nil || beforeID < 1 {
		RespondError(c, http.StatusBadRequest, "Invalid cursor")
		return
	}

	messages, hasMore, err := h.messageRepo.ListByConversationIDBefore(
		c.Request.Context(), conversationID, beforeID, omniChatTranscriptPageSize)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load messages")
		return
	}
	decorateOmniChatMessageAttachments(messages, userID)

	c.JSON(http.StatusOK, gin.H{"messages": messages, "has_more": hasMore})
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
	Content   string    `json:"content" binding:"required"`
	RequestID uuid.UUID `json:"request_id"`
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
	claim, ok := h.claimOmniChatRequest(c, userID, req.RequestID, "chat_send", fmt.Sprintf("conversation:%d", conversationID), struct {
		Content string `json:"content"`
	}{Content: content})
	if !ok {
		return
	}
	if claim.Replay {
		c.Data(http.StatusOK, "application/json", claim.Response)
		return
	}
	completed := false
	defer func() {
		if !completed {
			h.failOmniChatRequest(userID, req.RequestID)
		}
	}()
	if h.replies == nil {
		RespondError(c, http.StatusServiceUnavailable, "Chat is temporarily unavailable")
		return
	}
	lease, ok := reserveOmniChatAllowance(c, h.allowance, 1)
	if !ok {
		return
	}
	leaseSettled := false
	settleLease := func(delivered bool) {
		replies := 0
		if delivered {
			replies = 1
		}
		commitOmniChatAllowance(h.allowance, lease, &replies)
	}
	defer func() {
		if !leaseSettled {
			settleLease(false)
		}
	}()

	userTurn, err := h.chatbotService.AcceptUserTurn(services.WithOmniChatClientRequestID(c.Request.Context(), req.RequestID), userID, conversationID, content)
	if err != nil {
		if errors.Is(err, services.ErrNotFound) {
			RespondError(c, http.StatusNotFound, "Conversation not found")
			return
		}
		// Told, not left wondering. There is a review to appeal to, and an
		// appeal nobody knows they need is not one.
		if errors.Is(err, services.ErrOmniChatBlockedByPersona) {
			RespondErrorCoded(c, http.StatusForbidden, "blocked_by_character",
				"This character is not talking to you right now.")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to send message")
		return
	}

	accepted := OmniChatAcceptedTurn{Accepted: true, UserMessage: userTurn}
	// The claim is settled by acceptance, not by the answer. It used to be
	// closed when the assistant message was written, and leaving it open until
	// then would now hold the conversation's in-progress lock for the whole
	// wait -- so the next message in a burst would be refused as a duplicate
	// turn rather than folded into this one.
	payload, claimErr := json.Marshal(accepted)
	if claimErr == nil {
		claimErr = h.completeOmniChatRequest(userID, req.RequestID, payload)
	}
	if claimErr != nil {
		// Deliberately leave `completed` false so the deferred failure marks the
		// claim. A claim stuck pending holds the conversation's lock and the
		// user cannot send again until the lease runs out; a failed one lets a
		// retry straight through, and the retry cannot duplicate anything
		// because the turn is keyed by the same request id.
		zlog.Warn().Err(claimErr).Int("user_id", userID).Int("conversation_id", conversationID).
			Msg("omnichat: could not close the request claim for an accepted turn")
	} else {
		completed = true
	}

	leaseSettled = true
	h.replies.Schedule(userID, conversationID, services.OmniChatSettleWindow, settleLease)

	c.JSON(http.StatusAccepted, accepted)
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
	var req struct {
		RequestID uuid.UUID `json:"request_id"`
	}
	if err := decodeStrictJSON(c, &req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid regenerate request")
		return
	}
	claim, ok := h.claimOmniChatRequest(c, userID, req.RequestID, "chat_regenerate", fmt.Sprintf("conversation:%d", conversationID), struct {
		MessageID int `json:"message_id"`
	}{MessageID: messageID})
	if !ok {
		return
	}
	if claim.Replay {
		c.Data(http.StatusOK, "application/json", claim.Response)
		return
	}
	completed := false
	defer func() {
		if !completed {
			h.failOmniChatRequest(userID, req.RequestID)
		}
	}()
	lease, ok := reserveOmniChatAllowance(c, h.allowance, 1)
	if !ok {
		return
	}
	successfulReplies := 0
	defer commitOmniChatAllowance(h.allowance, lease, &successfulReplies)

	message, err := h.chatbotService.RegenerateMessage(
		services.WithOmniChatClientRequestID(c.Request.Context(), req.RequestID),
		userID,
		conversationID,
		messageID,
	)
	if err != nil {
		// The regenerated reply may already be durably replaced and linked to
		// a reserved billing operation when only the final capture failed.
		// Reconciliation will capture it; return the persisted response so the
		// browser and database do not diverge.
		if message != nil {
			completed = true
			successfulReplies = 1
			c.JSON(http.StatusOK, message)
			return
		}
		if respondOmniChatCreditsRequired(c, err) {
			return
		}
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
	if !message.Failed {
		successfulReplies = 1
	}
	completed = true

	c.JSON(http.StatusOK, message)
}

func (h *OmniChatHandler) claimOmniChatRequest(c *gin.Context, userID int, requestID uuid.UUID, scope, resource string, payload any) (*models.OmniChatRequestClaim, bool) {
	if requestID == uuid.Nil {
		RespondError(c, http.StatusBadRequest, "A valid request_id is required")
		return nil, false
	}
	if h.idempotency == nil {
		RespondError(c, http.StatusServiceUnavailable, "Request replay protection is temporarily unavailable")
		return nil, false
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to prepare request")
		return nil, false
	}
	claim, err := h.idempotency.Begin(c.Request.Context(), userID, requestID, scope, resource, models.OmniChatRequestPayloadHash(encoded))
	if err == nil {
		return claim, true
	}
	switch {
	case errors.Is(err, models.ErrOmniChatRequestConflict):
		RespondError(c, http.StatusConflict, "request_id was already used for a different request")
	case errors.Is(err, models.ErrOmniChatRequestInProgress), errors.Is(err, models.ErrOmniChatConversationBusy):
		RespondError(c, http.StatusConflict, "A matching conversation request is already in progress")
	default:
		RespondError(c, http.StatusServiceUnavailable, "Request replay protection is temporarily unavailable")
	}
	return nil, false
}

func (h *OmniChatHandler) failOmniChatRequest(userID int, requestID uuid.UUID) {
	if h.idempotency == nil || requestID == uuid.Nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.idempotency.Fail(ctx, userID, requestID); err != nil {
		zlog.Error().Err(err).Int("user_id", userID).Str("request_id", requestID.String()).Msg("omnichat: failed to release request idempotency claim")
	}
}

// completeOmniChatRequest closes a claim with the response a replay should get.
// The counterpart to failOmniChatRequest, for the path where the work the
// request asked for is done even though the reply it leads to is not.
func (h *OmniChatHandler) completeOmniChatRequest(userID int, requestID uuid.UUID, response json.RawMessage) error {
	if h.idempotency == nil || requestID == uuid.Nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return h.idempotency.Complete(ctx, userID, requestID, response)
}

func respondOmniChatCreditsRequired(c *gin.Context, err error) bool {
	if !errors.Is(err, models.ErrOmniCreditsInsufficient) {
		return false
	}
	RespondError(c, http.StatusPaymentRequired, "This response requires OmniCredits")
	return true
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
	lease, ok := reserveOmniChatAllowance(c, h.allowance, 1)
	if !ok {
		return
	}
	successfulReplies := 0
	defer commitOmniChatAllowance(h.allowance, lease, &successfulReplies)

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
	if !failed && fullText != "" {
		successfulReplies = 1
	}

	c.JSON(http.StatusOK, gin.H{
		"role":    "assistant",
		"content": fullText,
		"failed":  failed,
	})
}

func reserveOmniChatAllowance(c *gin.Context, allowance *services.OmniChatAllowance, count int) (*services.OmniChatAllowanceLease, bool) {
	if allowance == nil {
		RespondError(c, http.StatusServiceUnavailable, "Chat allowance is temporarily unavailable")
		return nil, false
	}
	var userID *int
	if value, ok := middleware.GetOptionalUserID(c); ok {
		userID = &value
	}
	lease, err := allowance.Reserve(c.Request.Context(), userID, c.ClientIP(), count)
	if err != nil {
		RespondError(c, http.StatusServiceUnavailable, "Chat allowance is temporarily unavailable")
		return nil, false
	}
	writeOmniChatAllowanceHeaders(c, lease.State)
	if !lease.State.Allowed {
		status := http.StatusTooManyRequests
		message := "Your rolling chat allowance has been used"
		if lease.State.CreditsRequired {
			status = http.StatusPaymentRequired
			message = "OmniCredits are required to continue beyond your rolling chat allowance"
		}
		response := apiresponse.NewErrorResponse(status, message, apiresponse.RequestIDFromContext(c))
		c.JSON(status, gin.H{
			"error": response.Error, "code": response.Code, "message": response.Message,
			"request_id": response.RequestID, "allowance": lease.State,
		})
		return nil, false
	}
	return lease, true
}

func inspectOmniChatAllowance(c *gin.Context, allowance *services.OmniChatAllowance) (services.OmniChatAllowanceState, error) {
	if allowance == nil {
		return services.OmniChatAllowanceState{}, errors.New("chat allowance is unavailable")
	}
	var userID *int
	if value, ok := middleware.GetOptionalUserID(c); ok {
		userID = &value
	}
	return allowance.Status(c.Request.Context(), userID, c.ClientIP())
}

func commitOmniChatAllowance(allowance *services.OmniChatAllowance, lease *services.OmniChatAllowanceLease, successfulReplies *int) {
	if allowance == nil || lease == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	// A transition failure cannot replace a response that was already
	// delivered, but it must remain observable with its operation context.
	// Unlinked overage holds are conservatively refunded by reconciliation.
	if err := allowance.Commit(ctx, lease, *successfulReplies); err != nil {
		zlog.Error().Err(err).Int("successful_replies", *successfulReplies).
			Msg("omnichat: failed to finalize allowance reservation")
	}
}

func writeOmniChatAllowanceHeaders(c *gin.Context, state services.OmniChatAllowanceState) {
	c.Header("X-OmniChat-Allowance-Tier", state.Tier)
	if state.Unlimited {
		c.Header("X-OmniChat-Allowance-Unlimited", "true")
		return
	}
	c.Header("X-OmniChat-Allowance-Limit", strconv.Itoa(state.Limit))
	c.Header("X-OmniChat-Allowance-Remaining", strconv.Itoa(state.Remaining))
	if state.ResetAt != nil {
		c.Header("X-OmniChat-Allowance-Reset", state.ResetAt.UTC().Format(time.RFC3339))
	}
}

package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/omninudge/backend/internal/websocket"
	zlog "github.com/rs/zerolog/log"
)

// maxHistoryMessages bounds how many prior turns are sent as context on each
// generation call; older turns fall off rather than growing the prompt (and
// OpenRouter request cost) unbounded.
const maxHistoryMessages = 40

// ChatbotService orchestrates OmniChat conversations: it assembles a
// persona's system prompt and conversation history into a request, streams
// the generated reply to the user over the WebSocket hub, and persists both
// sides of the exchange.
type ChatbotService struct {
	pool        *pgxpool.Pool
	personaRepo *models.BotPersonaRepository
	convRepo    *models.BotConversationRepository
	messageRepo *models.BotMessageRepository
	openrouter  *openrouter.Client
	hub         *websocket.Hub
}

// NewChatbotService creates a new chatbot service.
func NewChatbotService(
	pool *pgxpool.Pool,
	personaRepo *models.BotPersonaRepository,
	convRepo *models.BotConversationRepository,
	messageRepo *models.BotMessageRepository,
	openrouterClient *openrouter.Client,
	hub *websocket.Hub,
) *ChatbotService {
	return &ChatbotService{
		pool:        pool,
		personaRepo: personaRepo,
		convRepo:    convRepo,
		messageRepo: messageRepo,
		openrouter:  openrouterClient,
		hub:         hub,
	}
}

// SendMessage persists the user's message, generates the persona's reply
// (streaming tokens to the user over the WebSocket hub as they arrive), and
// persists the reply. Returns the assistant's message once generation
// completes — including when generation failed, in which case the returned
// message's Failed flag is set and err is non-nil.
func (s *ChatbotService) SendMessage(ctx context.Context, userID, conversationID int, content string) (*models.BotMessage, error) {
	conv, err := s.convRepo.GetByID(ctx, conversationID, userID)
	if err != nil {
		return nil, fmt.Errorf("chatbot: load conversation: %w", err)
	}
	if conv == nil {
		return nil, ErrNotFound
	}

	persona, err := s.personaRepo.GetByID(ctx, conv.PersonaID)
	if err != nil {
		return nil, fmt.Errorf("chatbot: load persona: %w", err)
	}
	if persona == nil {
		return nil, ErrNotFound
	}

	if _, err := s.messageRepo.Create(ctx, conversationID, models.BotMessageRoleUser, content, false); err != nil {
		return nil, fmt.Errorf("chatbot: save user message: %w", err)
	}

	history, err := s.messageRepo.ListByConversationID(ctx, conversationID, maxHistoryMessages)
	if err != nil {
		return nil, fmt.Errorf("chatbot: load history: %w", err)
	}

	messages := make([]openrouter.Message, 0, len(history)+1)
	messages = append(messages, openrouter.Message{Role: openrouter.RoleSystem, Content: persona.SystemPrompt})
	for _, m := range history {
		role := openrouter.RoleUser
		if m.Role == models.BotMessageRoleAssistant {
			role = openrouter.RoleAssistant
		}
		messages = append(messages, openrouter.Message{Role: role, Content: m.Content})
	}

	fullText, genErr := s.openrouter.Generate(ctx, messages, func(token string) {
		s.hub.Broadcast(&websocket.Message{
			RecipientID: userID,
			Type:        "omnichat_token",
			Payload: map[string]interface{}{
				"conversation_id": conversationID,
				"token":           token,
			},
		})
	})

	failed := genErr != nil
	if failed {
		zlog.Warn().Err(genErr).Int("conversation_id", conversationID).Int("persona_id", conv.PersonaID).
			Msg("chatbot: generation failed")
		fullText = userFacingGenerationError(genErr)
	}

	assistantMsg, err := s.messageRepo.Create(ctx, conversationID, models.BotMessageRoleAssistant, fullText, failed)
	if err != nil {
		return nil, fmt.Errorf("chatbot: save assistant message: %w", err)
	}

	// Non-fatal: the message is already persisted and is the real result of
	// this call. A failure bumping the conversation's sort timestamp should
	// not discard that success and turn it into a 500 for the caller — it
	// only affects "most recently active" ordering in a future list view.
	if err := s.convRepo.UpdateLastMessageAt(ctx, conversationID); err != nil {
		zlog.Warn().Err(err).Int("conversation_id", conversationID).
			Msg("chatbot: failed to update conversation last_message_at")
	}

	s.hub.Broadcast(&websocket.Message{
		RecipientID: userID,
		Type:        "omnichat_message_complete",
		Payload:     assistantMsg,
	})

	return assistantMsg, genErr
}

// userFacingGenerationError converts a generation error into copy safe to
// store and display — never the raw upstream error, which may include
// provider names or account details.
func userFacingGenerationError(err error) string {
	if errors.Is(err, openrouter.ErrNotConfigured) {
		return "OmniChat isn't configured yet."
	}
	if errors.Is(err, openrouter.ErrRateLimited) {
		return "I'm a bit overwhelmed right now — please try again in a moment."
	}
	return "The bot is busy right now — please try again in a moment."
}

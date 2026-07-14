package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/omninudge/backend/internal/websocket"
	"github.com/stretchr/testify/require"
)

type stubChatCompletionClient struct {
	generate func(ctx context.Context, messages []openrouter.Message, onChunk openrouter.StreamCallback) (string, error)
}

func (s stubChatCompletionClient) Generate(ctx context.Context, messages []openrouter.Message, onChunk openrouter.StreamCallback) (string, error) {
	return s.generate(ctx, messages, onChunk)
}

func TestBuildConversationSystemPromptUsesStructuredPersonaFields(t *testing.T) {
	persona := &models.BotPersona{
		Name:                    "Archivist",
		SystemPrompt:            "{{original}}\nDo not leave the library.",
		Personality:             "Methodical and suspicious.",
		Scenario:                "A sentient archive after midnight.",
		ExampleDialogue:         "<START>\nArchivist: The shelves are listening.",
		PostHistoryInstructions: "Keep the replies tense.",
		CharacterBookJSON:       json.RawMessage(`{"entries":[{"keys":["vault"],"content":"The vault remembers every visitor.","enabled":true,"position":"before_char"}]}`),
	}
	history := []*models.BotMessage{{Role: models.BotMessageRoleUser, Content: "Tell me about the vault."}}

	prompt := buildConversationSystemPrompt(persona, &models.ConversationSettings{UserName: "Riley"}, history)

	require.Contains(t, prompt, "You are Archivist.")
	require.Contains(t, prompt, "Personality: Methodical and suspicious.")
	require.Contains(t, prompt, "The vault remembers every visitor.")
	require.Contains(t, prompt, "Do not leave the library.")
	require.Contains(t, prompt, "[Post-History Instructions]")
	require.Contains(t, prompt, `Preferred name: "Riley"`)
}

func TestBuildStarterMessagePrefersFirstMessage(t *testing.T) {
	service := &ChatbotService{}
	persona := &models.BotPersona{
		FirstMessage:       "The fire crackles.",
		AlternateGreetings: []string{"Hello there."},
	}

	require.Equal(t, "The fire crackles.", service.BuildStarterMessage(persona))
	require.True(t, strings.TrimSpace(service.BuildStarterMessage(&models.BotPersona{})) == "")
}

func TestSendMessagePersistsFallbackWhenParentContextIsCanceled(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     fmt.Sprintf("omnichat_send_%d", time.Now().UnixNano()),
		PasswordHash: "hash",
		Role:         "user",
	}
	require.NoError(t, userRepo.Create(ctx, user))

	personaRepo := models.NewBotPersonaRepository(db.Pool)
	persona, err := personaRepo.CreateOwned(ctx, user.ID, &models.BotPersona{
		Slug:               fmt.Sprintf("u%d-send-%d", user.ID, time.Now().UnixNano()),
		Name:               "Timeout Persona",
		Category:           models.PersonaCategoryOriginal,
		Visibility:         "private",
		SourceFormat:       "native",
		SystemPrompt:       "stay in character",
		AlternateGreetings: []string{},
		Tags:               []string{},
		GalleryURLs:        []string{},
		ExtensionsJSON:     json.RawMessage(`{}`),
	})
	require.NoError(t, err)

	convRepo := models.NewBotConversationRepository(db.Pool)
	conversation, err := convRepo.CreateWithMessages(ctx, user.ID, persona.ID, nil, nil, nil)
	require.NoError(t, err)

	messageRepo := models.NewBotMessageRepository(db.Pool)
	parentCtx, cancel := context.WithCancel(ctx)
	service := NewChatbotService(
		db.Pool,
		personaRepo,
		convRepo,
		messageRepo,
		stubChatCompletionClient{
			generate: func(generateCtx context.Context, _ []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
				cancel()
				select {
				case <-generateCtx.Done():
					t.Fatalf("generation context should not be canceled by parent request context")
				default:
				}
				return "", openrouter.ErrNotConfigured
			},
		},
		websocket.NewHub(),
	)

	assistantMsg, sendErr := service.SendMessage(parentCtx, user.ID, conversation.ID, "Hello there")
	require.ErrorIs(t, sendErr, openrouter.ErrNotConfigured)
	require.NotNil(t, assistantMsg)
	require.True(t, assistantMsg.Failed)
	require.Equal(t, "OmniChat isn't configured yet.", assistantMsg.Content)

	messages, err := messageRepo.ListByConversationID(ctx, conversation.ID, 10)
	require.NoError(t, err)
	require.Len(t, messages, 2)
	require.Equal(t, models.BotMessageRoleUser, messages[0].Role)
	require.Equal(t, "Hello there", messages[0].Content)
	require.Equal(t, models.BotMessageRoleAssistant, messages[1].Role)
	require.True(t, messages[1].Failed)
	require.Equal(t, "OmniChat isn't configured yet.", messages[1].Content)
}

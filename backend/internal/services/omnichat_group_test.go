package services

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

type omniChatGroupStoreFake struct {
	mu               sync.Mutex
	userMessage      *models.OmniChatGroupMessage
	persona          *models.BotPersona
	personaMessage   *models.OmniChatGroupMessage
	personaMessages  []*models.OmniChatGroupMessage
	inviteDigest     string
	acceptedDigest   string
	existingBatch    []*models.OmniChatGroupMessage
	validationErr    error
	validateCalls    int
	historyCalls     int
	createBatchCalls int
}

func (f *omniChatGroupStoreFake) CreateUserMessage(_ context.Context, groupID uuid.UUID, userID int, content string, reply *uuid.UUID) (*models.OmniChatGroupMessage, error) {
	f.userMessage = &models.OmniChatGroupMessage{ID: uuid.New(), GroupID: groupID, SenderType: "user", SenderUserID: &userID, Content: content, ReplyToID: reply, SenderName: "Nick"}
	return f.userMessage, nil
}
func (f *omniChatGroupStoreFake) CreatePersonaMessage(_ context.Context, groupID uuid.UUID, personaID int, content string, reply *uuid.UUID, failed bool) (*models.OmniChatGroupMessage, error) {
	message := &models.OmniChatGroupMessage{ID: uuid.New(), GroupID: groupID, SenderType: "persona", SenderPersonaID: &personaID, Content: content, ReplyToID: reply, Failed: failed}
	f.mu.Lock()
	f.personaMessage = message
	f.personaMessages = append(f.personaMessages, message)
	f.mu.Unlock()
	return message, nil
}
func (f *omniChatGroupStoreFake) GetMessageBatchByRequest(context.Context, uuid.UUID, int, uuid.UUID) ([]*models.OmniChatGroupMessage, error) {
	return f.existingBatch, nil
}
func (f *omniChatGroupStoreFake) ValidateGroupSend(_ context.Context, _ uuid.UUID, _ int, personaIDs []int) (*models.OmniChatGroupSendContext, error) {
	f.validateCalls++
	if f.validationErr != nil {
		return nil, f.validationErr
	}
	personas := make([]*models.BotPersona, 0, len(personaIDs))
	for _, personaID := range personaIDs {
		persona := &models.BotPersona{ID: personaID, Name: "Sadie", SystemPrompt: "You are Sadie."}
		if f.persona != nil {
			*persona = *f.persona
			persona.ID = personaID
		}
		personas = append(personas, persona)
	}
	return &models.OmniChatGroupSendContext{SenderName: "Nick", Personas: personas}, nil
}
func (f *omniChatGroupStoreFake) CreateMessageBatch(_ context.Context, groupID uuid.UUID, userID int, _ uuid.UUID, content string, reply *uuid.UUID, replies []models.OmniChatGroupPersonaReply) ([]*models.OmniChatGroupMessage, bool, error) {
	f.createBatchCalls++
	f.userMessage = &models.OmniChatGroupMessage{ID: uuid.New(), GroupID: groupID, SenderType: "user", SenderUserID: &userID, Content: content, ReplyToID: reply, SenderName: "Nick"}
	messages := []*models.OmniChatGroupMessage{f.userMessage}
	for _, generated := range replies {
		personaID := generated.PersonaID
		message := &models.OmniChatGroupMessage{
			ID: uuid.New(), GroupID: groupID, SenderType: "persona",
			SenderPersonaID: &personaID, Content: generated.Content, ReplyToID: &f.userMessage.ID, Failed: generated.Failed,
		}
		f.personaMessage = message
		f.personaMessages = append(f.personaMessages, message)
		messages = append(messages, message)
	}
	return messages, true, nil
}
func (f *omniChatGroupStoreFake) ListMessagesForMember(_ context.Context, _ uuid.UUID, _ int, _ *models.OmniChatGroupMessageCursor, _ int) ([]*models.OmniChatGroupMessage, error) {
	f.historyCalls++
	return []*models.OmniChatGroupMessage{f.userMessage}, nil
}
func (f *omniChatGroupStoreFake) GetPersonaInGroup(_ context.Context, _ uuid.UUID, _ int) (*models.BotPersona, error) {
	return f.persona, nil
}
func (f *omniChatGroupStoreFake) ListGroupPersonas(_ context.Context, _ uuid.UUID) ([]*models.OmniChatGroupPersona, error) {
	return []*models.OmniChatGroupPersona{{PersonaID: f.persona.ID, Name: f.persona.Name}}, nil
}
func (f *omniChatGroupStoreFake) ListMemberIDsForSender(_ context.Context, _ uuid.UUID, _ *int) ([]int, error) {
	return []int{1, 2}, nil
}
func (f *omniChatGroupStoreFake) CreateInvite(_ context.Context, groupID uuid.UUID, _ int, invitee *int, digest string, maxUses int, expires time.Time) (*models.OmniChatGroupInvite, error) {
	f.inviteDigest = digest
	return &models.OmniChatGroupInvite{ID: uuid.New(), GroupID: groupID, InviteeUserID: invitee, MaxUses: maxUses, ExpiresAt: expires}, nil
}
func (f *omniChatGroupStoreFake) AcceptInvite(_ context.Context, digest string, _ int) (*models.OmniChatGroup, error) {
	f.acceptedDigest = digest
	return &models.OmniChatGroup{ID: uuid.New()}, nil
}

type groupCompletionFake struct{ response string }

func (f groupCompletionFake) Generate(_ context.Context, _ []openrouter.Message, onChunk openrouter.StreamCallback) (string, error) {
	if onChunk != nil {
		onChunk(f.response)
	}
	return f.response, nil
}

type concurrentGroupCompletionFake struct {
	active int32
	max    int32
}

func (f *concurrentGroupCompletionFake) Generate(_ context.Context, _ []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
	active := atomic.AddInt32(&f.active, 1)
	for {
		max := atomic.LoadInt32(&f.max)
		if active <= max || atomic.CompareAndSwapInt32(&f.max, max, active) {
			break
		}
	}
	time.Sleep(40 * time.Millisecond)
	atomic.AddInt32(&f.active, -1)
	return "Here!", nil
}

func TestOmniChatGroupServiceCreatesCharacterReplyFromGroupContext(t *testing.T) {
	store := &omniChatGroupStoreFake{persona: &models.BotPersona{ID: 42, Name: "Sadie", SystemPrompt: "You are Sadie."}}
	service := NewOmniChatGroupService(store, groupCompletionFake{response: "I brought snacks."}, nil)
	groupID := uuid.New()
	messages, created, err := service.SendMessage(context.Background(), groupID, 7, uuid.New(), "Sadie, did you bring food?", nil, []int{42})
	require.NoError(t, err)
	require.True(t, created)
	require.Len(t, messages, 2)
	require.Equal(t, "I brought snacks.", store.personaMessage.Content)
	require.Equal(t, store.userMessage.ID, *store.personaMessage.ReplyToID)
}

func TestOmniChatGroupServiceReturnsIdempotentBatchWithoutRegenerating(t *testing.T) {
	userID := 7
	existing := []*models.OmniChatGroupMessage{{
		ID: uuid.New(), GroupID: uuid.New(), SenderType: "user",
		SenderUserID: &userID, Content: "Already committed",
	}}
	store := &omniChatGroupStoreFake{existingBatch: existing}
	completion := &concurrentGroupCompletionFake{}
	service := NewOmniChatGroupService(store, completion, nil)

	messages, created, err := service.SendMessage(
		context.Background(), existing[0].GroupID, userID, uuid.New(),
		"Duplicate retry", nil, []int{42},
	)

	require.NoError(t, err)
	require.False(t, created)
	require.Equal(t, existing, messages)
	require.Zero(t, store.validateCalls)
	require.Zero(t, store.historyCalls)
	require.Zero(t, store.createBatchCalls)
	require.Zero(t, atomic.LoadInt32(&completion.max))
}

func TestOmniChatGroupServiceValidatesAllRespondersBeforePersistence(t *testing.T) {
	store := &omniChatGroupStoreFake{validationErr: errors.New("persona unavailable")}
	service := NewOmniChatGroupService(store, groupCompletionFake{response: "must not run"}, nil)

	_, created, err := service.SendMessage(
		context.Background(), uuid.New(), 7, uuid.New(),
		"Hello", nil, []int{42, 99},
	)

	require.EqualError(t, err, "persona unavailable")
	require.False(t, created)
	require.Equal(t, 1, store.validateCalls)
	require.Zero(t, store.historyCalls)
	require.Zero(t, store.createBatchCalls)
	require.Nil(t, store.userMessage)
}

func TestOmniChatGroupServiceCommitsExplicitFailedReplyWhenProviderUnavailable(t *testing.T) {
	store := &omniChatGroupStoreFake{}
	service := NewOmniChatGroupService(store, nil, nil)

	messages, created, err := service.SendMessage(
		context.Background(), uuid.New(), 7, uuid.New(),
		"Sadie?", nil, []int{42},
	)

	require.NoError(t, err)
	require.True(t, created)
	require.Len(t, messages, 2)
	require.Equal(t, 1, store.createBatchCalls)
	require.True(t, messages[1].Failed)
	require.Equal(t, "I couldn't respond just now.", messages[1].Content)
}

func TestOmniChatGroupServiceInviteTokensAreHashedAtRest(t *testing.T) {
	store := &omniChatGroupStoreFake{persona: &models.BotPersona{ID: 42, Name: "Sadie"}}
	service := NewOmniChatGroupService(store, nil, nil)
	rawToken, _, err := service.CreateInvite(context.Background(), uuid.New(), 7, nil, 3)
	require.NoError(t, err)
	require.NotEmpty(t, rawToken)
	require.NotEqual(t, rawToken, store.inviteDigest)
	_, err = service.AcceptInvite(context.Background(), rawToken, 8)
	require.NoError(t, err)
	require.Equal(t, store.inviteDigest, store.acceptedDigest)
}

func TestOmniChatGroupServiceGeneratesMultipleCharacterRepliesConcurrently(t *testing.T) {
	store := &omniChatGroupStoreFake{persona: &models.BotPersona{ID: 42, Name: "Sadie", SystemPrompt: "You are Sadie."}}
	completion := &concurrentGroupCompletionFake{}
	service := NewOmniChatGroupService(store, completion, nil)

	messages, created, err := service.SendMessage(context.Background(), uuid.New(), 7, uuid.New(), "What does everyone think?", nil, []int{42, 43})

	require.NoError(t, err)
	require.True(t, created)
	require.Len(t, messages, 3)
	require.EqualValues(t, 2, atomic.LoadInt32(&completion.max))
}

func TestOmniChatGroupServiceBoundsProviderReplyBeforePersistence(t *testing.T) {
	store := &omniChatGroupStoreFake{persona: &models.BotPersona{ID: 42, Name: "Sadie", SystemPrompt: "You are Sadie."}}
	service := NewOmniChatGroupService(store, groupCompletionFake{response: strings.Repeat("a", 10_001)}, nil)

	_, created, err := service.SendMessage(context.Background(), uuid.New(), 7, uuid.New(), "Sadie?", nil, []int{42})

	require.NoError(t, err)
	require.True(t, created)
	require.Len(t, []rune(store.personaMessage.Content), 10_000)
}

func TestOmniChatGroupServiceRetriesLeakedProviderDelimiter(t *testing.T) {
	calls := 0
	completion := stubChatCompletionClient{generate: func(_ context.Context, messages []openrouter.Message, onChunk openrouter.StreamCallback) (string, error) {
		calls++
		onChunk("leaked token must not be sent")
		if calls == 1 {
			return "Opening a new response. <|end|>", nil
		}
		require.Equal(t, openrouter.RoleSystem, messages[0].Role)
		require.Contains(t, messages[0].Content, "[Provider Output Retry]")
		return "I brought snacks.", nil
	}}
	service := NewOmniChatGroupService(&omniChatGroupStoreFake{}, completion, nil)
	content, failed := service.generatePersonaReply(context.Background(), &models.BotPersona{ID: 42, Name: "Sadie"}, nil)

	require.False(t, failed)
	require.Equal(t, "I brought snacks.", content)
	require.Equal(t, 2, calls)
}

func TestOmniChatGroupServiceFiltersContaminatedPersonaHistoryOnly(t *testing.T) {
	userMessage := &models.OmniChatGroupMessage{SenderType: "user", SenderName: "Nick", Content: "What does <|end|> mean?"}
	leakedPersona := &models.OmniChatGroupMessage{SenderType: "persona", SenderName: "Sadie", Content: "Opening a new response. <|end|>"}
	cleanPersona := &models.OmniChatGroupMessage{SenderType: "persona", SenderName: "Sadie", Content: "It is an internal delimiter."}
	completion := stubChatCompletionClient{generate: func(_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		transcript := messages[1].Content
		require.Contains(t, transcript, userMessage.Content)
		require.NotContains(t, transcript, leakedPersona.Content)
		require.Contains(t, transcript, cleanPersona.Content)
		return "I brought snacks.", nil
	}}
	service := NewOmniChatGroupService(&omniChatGroupStoreFake{}, completion, nil)

	content, failed := service.generatePersonaReply(context.Background(), &models.BotPersona{ID: 42, Name: "Sadie"}, []*models.OmniChatGroupMessage{userMessage, leakedPersona, cleanPersona})

	require.False(t, failed)
	require.Equal(t, "I brought snacks.", content)
}

func TestAssistantOutputHygieneRejectsInvalidUTF8(t *testing.T) {
	valid, detail := validateAssistantOutputHygiene(string([]byte{'H', 'i', 0xff}))

	require.False(t, valid)
	require.Contains(t, detail, "UTF-8")
}

func TestAssistantOutputHygieneRejectsKnownProviderDelimiters(t *testing.T) {
	for _, artifact := range []string{
		"<|end|>",
		"<|eot_id|>",
		"<|im_end|>",
		"<|endoftext|>",
		"[INST]",
		"[/INST]",
		"<<SYS>>",
		"<</SYS>>",
		"<think>",
		"</think>",
	} {
		t.Run(artifact, func(t *testing.T) {
			valid, detail := validateAssistantOutputHygiene("Normal words " + artifact + " leaked words")
			require.False(t, valid)
			require.Contains(t, detail, "delimiter")
		})
	}
}

func TestAssistantOutputHygieneRejectsProviderPlanningLeak(t *testing.T) {
	leaked := `We need to continue dialogue. Maintain character Sadie, speaking naturally, keep within constraints. The user wants to continue the game.`

	valid, detail := validateAssistantOutputHygiene(leaked)

	require.False(t, valid)
	require.Contains(t, detail, "planning")
}

func TestAssistantOutputHygieneRejectsServerPromptMarkers(t *testing.T) {
	for _, marker := range []string{
		"[Platform Response Style: Natural Dialogue v1]",
		"[Conversation Integrity]",
		"[Post-History Instructions: stay grounded]",
		"[Character Definition]",
		"[Example Dialogue]",
		"[Actor and State Continuity]",
		"[Personal Conversation Mode]",
		"[Server Scene Continuity State]",
		"[User Profile Metadata]",
		"[Character Lorebook]",
		"[Additional Lorebook Context]",
		"[Provider Output Retry]",
		"[Personal Response Shape Retry]",
		"[Personal Length-Only Recovery]",
		"[Personal Dialogue-Only Recovery]",
	} {
		valid, detail := validateAssistantOutputHygiene("I can see the internal " + marker + " text.")
		require.False(t, valid)
		require.Contains(t, detail, "prompt marker")
	}
}

func TestAssistantOutputHygieneAllowsNaturalNeedStatement(t *testing.T) {
	valid, detail := validateAssistantOutputHygiene("We need to continue this conversation tomorrow, because I have an early meeting.")

	require.True(t, valid, detail)
}

// groupCompletionSpy keeps the system prompt a group reply was generated from.
type groupCompletionSpy struct {
	systemPrompt string
}

func (c *groupCompletionSpy) Generate(_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
	for _, message := range messages {
		if message.Role == openrouter.RoleSystem {
			c.systemPrompt = message.Content
		}
	}
	return "ok", nil
}

func TestAGroupClampsLikeEveryOtherSurface(t *testing.T) {
	// A group was the one surface that never asked. A character in one answered
	// explicitly for anybody -- whatever their plan, whatever their own
	// preference, and whatever the product-wide switch said -- because the
	// prompt was the persona's plus a group block and nothing else.
	persona := &models.BotPersona{ID: 1, Name: "Sadie", SystemPrompt: "You are Sadie."}
	history := []*models.OmniChatGroupMessage{
		{SenderType: "user", SenderName: "Nick", Content: "hello"},
	}

	clamped := &groupCompletionSpy{}
	_, _ = generateGroupPersonaReply(context.Background(), clamped, persona, history, false)
	require.Contains(t, clamped.systemPrompt, omniChatSFWClamp)
	require.True(t, strings.HasPrefix(clamped.systemPrompt, "You are Sadie."),
		"appended last, so a persona cannot license it away")

	entitled := &groupCompletionSpy{}
	_, _ = generateGroupPersonaReply(context.Background(), entitled, persona, history, true)
	require.NotContains(t, entitled.systemPrompt, omniChatSFWClamp)
}

func TestAnUnwiredGroupEntitlementClampsRatherThanExposes(t *testing.T) {
	// Losing the wiring should cost tone, never containment.
	var service *OmniChatGroupService
	service = &OmniChatGroupService{}
	require.False(t, service.entitlement.AllowsExplicit(context.Background(), 7))
}

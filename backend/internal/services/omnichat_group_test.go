package services

import (
	"context"
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
	mu              sync.Mutex
	userMessage     *models.OmniChatGroupMessage
	persona         *models.BotPersona
	personaMessage  *models.OmniChatGroupMessage
	personaMessages []*models.OmniChatGroupMessage
	inviteDigest    string
	acceptedDigest  string
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
func (f *omniChatGroupStoreFake) ListMessagesForMember(_ context.Context, _ uuid.UUID, _ int, _ *models.OmniChatGroupMessageCursor, _ int) ([]*models.OmniChatGroupMessage, error) {
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
	messages, err := service.SendMessage(context.Background(), groupID, 7, "Sadie, did you bring food?", nil, []int{42})
	require.NoError(t, err)
	require.Len(t, messages, 2)
	require.Equal(t, "I brought snacks.", store.personaMessage.Content)
	require.Equal(t, store.userMessage.ID, *store.personaMessage.ReplyToID)
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

	messages, err := service.SendMessage(context.Background(), uuid.New(), 7, "What does everyone think?", nil, []int{42, 43})

	require.NoError(t, err)
	require.Len(t, messages, 3)
	require.EqualValues(t, 2, atomic.LoadInt32(&completion.max))
}

func TestOmniChatGroupServiceBoundsProviderReplyBeforePersistence(t *testing.T) {
	store := &omniChatGroupStoreFake{persona: &models.BotPersona{ID: 42, Name: "Sadie", SystemPrompt: "You are Sadie."}}
	service := NewOmniChatGroupService(store, groupCompletionFake{response: strings.Repeat("a", 10_001)}, nil)

	_, err := service.SendMessage(context.Background(), uuid.New(), 7, "Sadie?", nil, []int{42})

	require.NoError(t, err)
	require.Len(t, []rune(store.personaMessage.Content), 10_000)
}

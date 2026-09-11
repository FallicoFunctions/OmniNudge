package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/geminilive"
	"github.com/omninudge/backend/internal/websocket"
	"github.com/stretchr/testify/require"
)

type fakeLiveSession struct {
	events    chan geminilive.Event
	mu        sync.Mutex
	audio     [][]byte
	responses []map[string]any
	answered  []string
	closed    bool
}

func newFakeLiveSession() *fakeLiveSession {
	return &fakeLiveSession{events: make(chan geminilive.Event, 32)}
}

func (f *fakeLiveSession) Events() <-chan geminilive.Event { return f.events }
func (f *fakeLiveSession) SendAudio(pcm []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.audio = append(f.audio, pcm)
	return nil
}
func (f *fakeLiveSession) RespondToTool(call geminilive.FunctionCall, response any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.answered = append(f.answered, call.ID)
	f.responses = append(f.responses, response.(map[string]any))
	return nil
}
func (f *fakeLiveSession) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.closed = true
	return nil
}
func (f *fakeLiveSession) Err() error { return nil }

type fakeLivePeer struct {
	audioIn chan []byte
	mu      sync.Mutex
	audio   [][]byte
	events  []LiveCallEvent
}

func newFakeLivePeer() *fakeLivePeer { return &fakeLivePeer{audioIn: make(chan []byte, 8)} }

func (p *fakeLivePeer) Audio() <-chan []byte { return p.audioIn }
func (p *fakeLivePeer) SendAudio(pcm []byte) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.audio = append(p.audio, pcm)
	return nil
}
func (p *fakeLivePeer) SendEvent(event LiveCallEvent) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.events = append(p.events, event)
	return nil
}
func (p *fakeLivePeer) eventTypes() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]string, 0, len(p.events))
	for _, e := range p.events {
		out = append(out, e.Type)
	}
	return out
}

type savedTurn struct{ heard, said string }

type fakeLiveTurns struct {
	mu     sync.Mutex
	saved  []savedTurn
	topics []string
}

func (f *fakeLiveTurns) RecallForCall(_ context.Context, _ int, _ *LiveCallPlan, topic string) map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.topics = append(f.topics, topic)
	return map[string]any{"found": true, "memories": "the interview went well"}
}
func (f *fakeLiveTurns) SaveCallTurn(_ context.Context, _, _ int, heard, said string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.saved = append(f.saved, savedTurn{heard, said})
	return nil
}
func (f *fakeLiveTurns) savedTurns() []savedTurn {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]savedTurn(nil), f.saved...)
}

func dialOnce(session LiveCallSession) (LiveCallDialer, *[]string) {
	var handles []string
	return func(_ context.Context, handle string) (LiveCallSession, error) {
		handles = append(handles, handle)
		return session, nil
	}, &handles
}

func runLiveCallAsync(t *testing.T, ctx context.Context, dial LiveCallDialer, peer LiveCallPeer, turns LiveCallTurns) <-chan error {
	t.Helper()
	done := make(chan error, 1)
	go func() { done <- RunLiveCall(ctx, 7, &LiveCallPlan{ConversationID: 11}, dial, peer, turns) }()
	return done
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestRunLiveCall_RelaysBothWaysAndSavesEachTurn(t *testing.T) {
	session := newFakeLiveSession()
	peer := newFakeLivePeer()
	turns := &fakeLiveTurns{}
	dial, _ := dialOnce(session)
	done := runLiveCallAsync(t, context.Background(), dial, peer, turns)

	peer.audioIn <- []byte{1, 2}
	waitFor(t, "the caller's audio to reach Live", func() bool {
		session.mu.Lock()
		defer session.mu.Unlock()
		return len(session.audio) == 1
	})

	session.events <- geminilive.Event{Kind: geminilive.EventInputTranscript, Text: "How are "}
	session.events <- geminilive.Event{Kind: geminilive.EventInputTranscript, Text: "you?"}
	session.events <- geminilive.Event{Kind: geminilive.EventAudio, Audio: []byte{9}}
	session.events <- geminilive.Event{Kind: geminilive.EventOutputTranscript, Text: "Good, "}
	session.events <- geminilive.Event{Kind: geminilive.EventOutputTranscript, Text: "thanks."}
	session.events <- geminilive.Event{Kind: geminilive.EventTurnComplete}
	session.events <- geminilive.Event{Kind: geminilive.EventOutputTranscript, Text: "Oh, and"}
	session.events <- geminilive.Event{Kind: geminilive.EventInterrupted}
	session.events <- geminilive.Event{Kind: geminilive.EventTurnComplete}

	waitFor(t, "two saved turns", func() bool { return len(turns.savedTurns()) == 2 })
	close(peer.audioIn)
	require.NoError(t, <-done)

	require.Equal(t, []savedTurn{{"How are you?", "Good, thanks."}, {"", "Oh, and"}}, turns.savedTurns(),
		"each turn is saved once, and an interrupted one keeps what she actually said")
	require.Equal(t, [][]byte{{9}}, peer.audio)
	require.Equal(t, []string{"heard", "heard", "said", "said", "turn_complete", "said", "interrupted", "turn_complete"}, peer.eventTypes())
	require.True(t, session.closed)
}

func TestRunLiveCall_HangingUpMidTurnKeepsWhatWasSaid(t *testing.T) {
	session := newFakeLiveSession()
	peer := newFakeLivePeer()
	turns := &fakeLiveTurns{}
	dial, _ := dialOnce(session)
	done := runLiveCallAsync(t, context.Background(), dial, peer, turns)

	session.events <- geminilive.Event{Kind: geminilive.EventInputTranscript, Text: "Talk later, bye"}
	session.events <- geminilive.Event{Kind: geminilive.EventOutputTranscript, Text: "Bye!"}
	waitFor(t, "her words to reach the browser", func() bool { return len(peer.eventTypes()) == 2 })
	close(peer.audioIn)
	require.NoError(t, <-done)

	require.Equal(t, []savedTurn{{"Talk later, bye", "Bye!"}}, turns.savedTurns())
}

func TestRunLiveCall_AnswersRecallAndRefusesUnknownTools(t *testing.T) {
	session := newFakeLiveSession()
	peer := newFakeLivePeer()
	turns := &fakeLiveTurns{}
	dial, _ := dialOnce(session)
	done := runLiveCallAsync(t, context.Background(), dial, peer, turns)

	session.events <- geminilive.Event{Kind: geminilive.EventToolCall, Calls: []geminilive.FunctionCall{
		{ID: "c1", Name: RecallMemoryTool, Args: json.RawMessage(`{"topic":"the job interview"}`)},
		{ID: "c2", Name: "delete_everything", Args: json.RawMessage(`{}`)},
	}}
	waitFor(t, "both tool answers", func() bool {
		session.mu.Lock()
		defer session.mu.Unlock()
		return len(session.answered) == 2
	})
	close(peer.audioIn)
	require.NoError(t, <-done)

	require.Equal(t, []string{"the job interview"}, turns.topics)
	require.Equal(t, []string{"c1", "c2"}, session.answered)
	require.Equal(t, true, session.responses[0]["found"])
	require.Contains(t, session.responses[1], "error")
}

func TestRunLiveCall_ResumesWhenTheProviderRotatesTheConnection(t *testing.T) {
	first, second := newFakeLiveSession(), newFakeLiveSession()
	peer := newFakeLivePeer()
	turns := &fakeLiveTurns{}
	var handles []string
	var dialMu sync.Mutex
	dial := func(_ context.Context, handle string) (LiveCallSession, error) {
		dialMu.Lock()
		defer dialMu.Unlock()
		handles = append(handles, handle)
		if len(handles) == 1 {
			return first, nil
		}
		return second, nil
	}
	done := runLiveCallAsync(t, context.Background(), dial, peer, turns)

	first.events <- geminilive.Event{Kind: geminilive.EventResumption, ResumeHandle: "h-1"}
	first.events <- geminilive.Event{Kind: geminilive.EventGoAway, TimeLeft: "5s"}
	close(first.events)

	second.events <- geminilive.Event{Kind: geminilive.EventOutputTranscript, Text: "Still here."}
	waitFor(t, "the resumed session to speak", func() bool { return len(peer.eventTypes()) == 1 })
	peer.audioIn <- []byte{4}
	waitFor(t, "audio to reach the resumed session", func() bool {
		second.mu.Lock()
		defer second.mu.Unlock()
		return len(second.audio) == 1
	})
	close(peer.audioIn)
	require.NoError(t, <-done)

	dialMu.Lock()
	require.Equal(t, []string{"", "h-1"}, handles)
	dialMu.Unlock()
}

func TestRunLiveCall_EndsWhenTheProviderClosesWithoutAHandle(t *testing.T) {
	session := newFakeLiveSession()
	peer := newFakeLivePeer()
	dial, handles := dialOnce(session)
	done := runLiveCallAsync(t, context.Background(), dial, peer, &fakeLiveTurns{})

	close(session.events)
	select {
	case err := <-done:
		require.ErrorIs(t, err, errLiveCallProviderEnded)
	case <-time.After(3 * time.Second):
		t.Fatal("the relay kept a call open that Live had ended")
	}
	require.Equal(t, []string{""}, *handles, "nothing to resume with, so no redial")
}

type liveCallFixture struct {
	service      *ChatbotService
	userID       int
	conversation *models.BotConversation
	messages     *models.BotMessageRepository
}

func newLiveCallFixture(t *testing.T, name, systemPrompt string) liveCallFixture {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &models.User{Username: fmt.Sprintf("live_call_%d", time.Now().UnixNano()), PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	personaRepo := models.NewBotPersonaRepository(db.Pool)
	persona, err := personaRepo.CreateOwned(ctx, user.ID, &models.BotPersona{
		Slug:               fmt.Sprintf("u%d-live-%d", user.ID, time.Now().UnixNano()),
		Name:               name,
		Category:           models.PersonaCategoryOriginal,
		Visibility:         "private",
		SourceFormat:       "native",
		SystemPrompt:       systemPrompt,
		AlternateGreetings: []string{},
		Tags:               []string{},
		GalleryURLs:        []string{},
		ExtensionsJSON:     json.RawMessage(`{}`),
	}, 100)
	require.NoError(t, err)
	convRepo := models.NewBotConversationRepository(db.Pool)
	conversation, err := convRepo.CreateWithMessages(ctx, user.ID, persona.ID, nil, nil, nil)
	require.NoError(t, err)
	messages := models.NewBotMessageRepository(db.Pool)
	service := NewChatbotService(db.Pool, personaRepo, convRepo, messages, stubChatCompletionClient{}, websocket.NewHub())
	return liveCallFixture{service: service, userID: user.ID, conversation: conversation, messages: messages}
}

func TestPrepareLiveCall_CarriesThePersonaHistoryAndTheTool(t *testing.T) {
	f := newLiveCallFixture(t, "Sadie", "You are Sadie, a warm friend.")
	ctx := context.Background()
	for _, turn := range []struct {
		role, content string
	}{
		{models.BotMessageRoleUser, "I have a job interview on Tuesday."},
		{models.BotMessageRoleAssistant, "You will be great. Tell me how it goes."},
	} {
		_, err := f.messages.Create(ctx, f.conversation.ID, turn.role, turn.content, false)
		require.NoError(t, err)
	}

	plan, err := f.service.PrepareLiveCall(ctx, f.userID, f.conversation.ID)
	require.NoError(t, err)

	require.Contains(t, plan.Instruction, "You are Sadie, a warm friend.")
	history := strings.Index(plan.Instruction, "[This Conversation So Far]")
	require.Positive(t, history)
	asked := strings.Index(plan.Instruction, "- They: I have a job interview on Tuesday.")
	answered := strings.Index(plan.Instruction, "- Sadie: You will be great. Tell me how it goes.")
	require.Greater(t, asked, history)
	require.Greater(t, answered, asked, "history reads oldest first")
	require.True(t, strings.HasSuffix(plan.Instruction, liveCallToolGuidance))
	require.Len(t, plan.Tools, 1)
	require.Equal(t, RecallMemoryTool, plan.Tools[0].Name)
	require.Equal(t, "Sadie", plan.PersonaName)
}

func TestPrepareLiveCall_RefusesSomebodyElsesConversation(t *testing.T) {
	f := newLiveCallFixture(t, "Sadie", "You are Sadie.")
	_, err := f.service.PrepareLiveCall(context.Background(), f.userID+1000, f.conversation.ID)
	require.ErrorIs(t, err, ErrNotFound)
}

func TestSaveCallTurn_KeepsBothHalvesAsMessages(t *testing.T) {
	f := newLiveCallFixture(t, "Sadie", "You are Sadie.")
	ctx := context.Background()

	require.NoError(t, f.service.SaveCallTurn(ctx, f.userID, f.conversation.ID, " How are you? ", "Good, thanks."))
	require.NoError(t, f.service.SaveCallTurn(ctx, f.userID, f.conversation.ID, "", "Oh, and"))
	require.NoError(t, f.service.SaveCallTurn(ctx, f.userID, f.conversation.ID, "  ", ""))

	history, err := f.messages.ListByConversationID(ctx, f.conversation.ID, 10)
	require.NoError(t, err)
	got := make([]string, 0, len(history))
	for _, m := range history {
		got = append(got, m.Role+": "+m.Content)
	}
	require.Equal(t, []string{"user: How are you?", "assistant: Good, thanks.", "assistant: Oh, and"}, got)
	require.ErrorIs(t, f.service.SaveCallTurn(ctx, f.userID+1000, f.conversation.ID, "hi", ""), ErrNotFound)
}

func TestRecallForCall_NoTopicIsNothingToRemember(t *testing.T) {
	f := newLiveCallFixture(t, "Sadie", "You are Sadie.")
	result := f.service.RecallForCall(context.Background(), f.userID, &LiveCallPlan{ConversationID: f.conversation.ID, PersonaName: "Sadie"}, "   ")
	require.Equal(t, false, result["found"])
}

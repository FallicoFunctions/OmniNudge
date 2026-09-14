package services

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
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
	texts     []string
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
func (f *fakeLiveSession) SendText(text string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.texts = append(f.texts, text)
	return nil
}
func (f *fakeLiveSession) sentTexts() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.texts...)
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
	audioIn  chan []byte
	controls chan LiveCallControl
	mu       sync.Mutex
	audio    [][]byte
	events   []LiveCallEvent
}

func newFakeLivePeer() *fakeLivePeer {
	return &fakeLivePeer{audioIn: make(chan []byte, 8), controls: make(chan LiveCallControl, 4)}
}

func (p *fakeLivePeer) Audio() <-chan []byte             { return p.audioIn }
func (p *fakeLivePeer) Controls() <-chan LiveCallControl { return p.controls }
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
	go func() {
		done <- RunLiveCall(ctx, 7, &LiveCallPlan{ConversationID: 11}, dial, peer, turns, LiveCallBilling{})
	}()
	return done
}

func runLiveCallBilled(t *testing.T, dial LiveCallDialer, peer LiveCallPeer, billing LiveCallBilling) <-chan error {
	t.Helper()
	done := make(chan error, 1)
	go func() {
		done <- RunLiveCall(context.Background(), 7, &LiveCallPlan{ConversationID: 11}, dial, peer, &fakeLiveTurns{}, billing)
	}()
	return done
}

type fakeMeter struct {
	mu       sync.Mutex
	minutes  []int
	refuse   bool
	attempts int
}

func (m *fakeMeter) tries() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.attempts
}

func (m *fakeMeter) ChargeMinute(_ context.Context, minute int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.attempts++
	if m.refuse {
		return models.ErrOmniCreditsInsufficient
	}
	m.minutes = append(m.minutes, minute)
	return nil
}

func (m *fakeMeter) charged() []int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]int(nil), m.minutes...)
}

func (m *fakeMeter) setRefuse(refuse bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.refuse = refuse
}

func withShortCallTimes(t *testing.T, minute, pause time.Duration) {
	t.Helper()
	oldMinute, oldPause := liveCallMinuteLength, maxLiveCallPause
	liveCallMinuteLength, maxLiveCallPause = minute, pause
	t.Cleanup(func() { liveCallMinuteLength, maxLiveCallPause = oldMinute, oldPause })
}

// Every minute is charged as it begins, so a call that runs into its third
// minute has paid for three.
func TestRunLiveCall_ChargesEachMinuteAsItBegins(t *testing.T) {
	withShortCallTimes(t, 80*time.Millisecond, time.Minute)
	meter := &fakeMeter{}
	session, peer := newFakeLiveSession(), newFakeLivePeer()
	dial, _ := dialOnce(session)
	done := runLiveCallBilled(t, dial, peer, LiveCallBilling{Meter: meter, StartedAt: time.Now()})

	waitFor(t, "the first minute", func() bool { return len(meter.charged()) >= 1 })
	time.Sleep(200 * time.Millisecond)
	close(peer.audioIn)
	require.NoError(t, <-done)

	got := meter.charged()
	require.GreaterOrEqual(t, len(got), 3, "two and a half minutes pays for three")
	require.LessOrEqual(t, len(got), 4)
	for i, minute := range got {
		require.Equal(t, i+1, minute, "minutes are numbered in order, each once")
	}
}

// The timer starts when the phone is pressed, not when Live answers: a call
// that took most of its first minute to connect is already into its second.
func TestRunLiveCall_TheFirstMinuteCountsFromThePress(t *testing.T) {
	withShortCallTimes(t, time.Second, time.Minute)
	meter := &fakeMeter{}
	session, peer := newFakeLiveSession(), newFakeLivePeer()
	dial, _ := dialOnce(session)
	done := runLiveCallBilled(t, dial, peer, LiveCallBilling{Meter: meter, StartedAt: time.Now().Add(-1500 * time.Millisecond)})

	deadline := time.Now().Add(400 * time.Millisecond)
	for len(meter.charged()) < 2 {
		if time.Now().After(deadline) {
			t.Fatalf("the second minute was not charged at once, though the press was a minute and a half ago: %v", meter.charged())
		}
		time.Sleep(5 * time.Millisecond)
	}
	close(peer.audioIn)
	require.NoError(t, <-done)
}

// An unpaid minute pauses the call instead of ending it. Nothing crosses while
// it is paused, and a resume that can pay picks the call back up.
func TestRunLiveCall_AnUnpaidMinutePausesUntilItIsPaid(t *testing.T) {
	withShortCallTimes(t, time.Hour, time.Minute)
	meter := &fakeMeter{refuse: true}
	session, peer := newFakeLiveSession(), newFakeLivePeer()
	dial, _ := dialOnce(session)
	done := runLiveCallBilled(t, dial, peer, LiveCallBilling{Meter: meter, StartedAt: time.Now()})

	waitFor(t, "the pause", func() bool { return slices.Contains(peer.eventTypes(), LiveCallEventPaused) })
	peer.audioIn <- []byte{1}
	session.events <- geminilive.Event{Kind: geminilive.EventAudio, Audio: []byte{9}}
	session.events <- geminilive.Event{Kind: geminilive.EventOutputTranscript, Text: "into the void"}
	time.Sleep(50 * time.Millisecond)
	session.mu.Lock()
	require.Empty(t, session.audio, "the caller was heard while the minute was unpaid")
	session.mu.Unlock()
	peer.mu.Lock()
	require.Empty(t, peer.audio, "she was heard while the minute was unpaid")
	peer.mu.Unlock()
	require.NotContains(t, peer.eventTypes(), LiveCallEventSaid)

	meter.setRefuse(false)
	peer.controls <- LiveCallControl{Type: LiveCallControlResume}
	waitFor(t, "the resume", func() bool { return slices.Contains(peer.eventTypes(), LiveCallEventResumed) })
	peer.audioIn <- []byte{2}
	waitFor(t, "the caller to be heard again", func() bool {
		session.mu.Lock()
		defer session.mu.Unlock()
		return len(session.audio) == 1
	})
	close(peer.audioIn)
	require.NoError(t, <-done)
	require.Equal(t, []int{1}, meter.charged(), "the minute that could not be paid is the one paid on resume")
}

func TestRunLiveCall_EndsWhenLeftUnpaid(t *testing.T) {
	withShortCallTimes(t, time.Hour, 100*time.Millisecond)
	meter := &fakeMeter{refuse: true}
	session, peer := newFakeLiveSession(), newFakeLivePeer()
	dial, _ := dialOnce(session)
	done := runLiveCallBilled(t, dial, peer, LiveCallBilling{Meter: meter, StartedAt: time.Now()})

	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(3 * time.Second):
		t.Fatal("a call nobody paid for stayed open")
	}
	require.Contains(t, peer.eventTypes(), LiveCallEventPaused)
}

// Asking to resume, and failing to pay each time, must not keep an unpaid call
// open: every failed resume used to restart the limit, so a script asking
// every few minutes held the call and its Live session forever.
func TestRunLiveCall_AskingToResumeDoesNotKeepAnUnpaidCallOpen(t *testing.T) {
	withShortCallTimes(t, time.Hour, 300*time.Millisecond)
	// Every resume is tried here, so only the limit can end the call.
	oldInterval := liveCallResumeInterval
	liveCallResumeInterval = 10 * time.Millisecond
	t.Cleanup(func() { liveCallResumeInterval = oldInterval })
	meter := &fakeMeter{refuse: true}
	session, peer := newFakeLiveSession(), newFakeLivePeer()
	dial, _ := dialOnce(session)
	started := time.Now()
	done := runLiveCallBilled(t, dial, peer, LiveCallBilling{Meter: meter, StartedAt: time.Now()})

	stop := make(chan struct{})
	defer close(stop)
	go func() {
		for {
			select {
			case <-stop:
				return
			case <-time.After(60 * time.Millisecond):
				select {
				case peer.controls <- LiveCallControl{Type: LiveCallControlResume}:
				default:
				}
			}
		}
	}()

	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(3 * time.Second):
		t.Fatal("repeated resumes kept an unpaid call open")
	}
	require.Less(t, time.Since(started), time.Second, "the unpaid limit was restarted by the resumes")
}

// A resume is a ledger write under a wallet lock, so a burst of them is one.
func TestRunLiveCall_ABurstOfResumesIsOneAttempt(t *testing.T) {
	withShortCallTimes(t, time.Hour, time.Minute)
	meter := &fakeMeter{refuse: true}
	session, peer := newFakeLiveSession(), newFakeLivePeer()
	dial, _ := dialOnce(session)
	done := runLiveCallBilled(t, dial, peer, LiveCallBilling{Meter: meter, StartedAt: time.Now()})

	waitFor(t, "the pause", func() bool { return slices.Contains(peer.eventTypes(), LiveCallEventPaused) })
	for range 3 {
		peer.controls <- LiveCallControl{Type: LiveCallControlResume}
	}
	time.Sleep(100 * time.Millisecond)
	close(peer.audioIn)
	require.NoError(t, <-done)
	require.Equal(t, 2, meter.tries(), "the charge at connect and one resume; the rest of the burst wrote nothing")
}

// The browser holds Continue at "Checking…" until it hears back, so a resume
// too soon after the last one is answered even though nothing is tried.
func TestRunLiveCall_AResumeTooSoonIsStillAnswered(t *testing.T) {
	withShortCallTimes(t, time.Hour, time.Minute)
	meter := &fakeMeter{refuse: true}
	session, peer := newFakeLiveSession(), newFakeLivePeer()
	dial, _ := dialOnce(session)
	done := runLiveCallBilled(t, dial, peer, LiveCallBilling{Meter: meter, StartedAt: time.Now()})

	pauses := func() int {
		n := 0
		for _, kind := range peer.eventTypes() {
			if kind == LiveCallEventPaused {
				n++
			}
		}
		return n
	}
	waitFor(t, "the pause", func() bool { return pauses() == 1 })
	peer.controls <- LiveCallControl{Type: LiveCallControlResume}
	waitFor(t, "the refused resume", func() bool { return pauses() == 2 })
	peer.controls <- LiveCallControl{Type: LiveCallControlResume}
	waitFor(t, "an answer to the resume that came too soon", func() bool { return pauses() == 3 })
	close(peer.audioIn)
	require.NoError(t, <-done)
	require.Equal(t, 2, meter.tries(), "the charge at connect and the first resume; the second wrote nothing")
}

// A resume while the call is paid for would charge a minute that has not begun.
func TestRunLiveCall_AResumeWhilePaidChargesNothing(t *testing.T) {
	withShortCallTimes(t, time.Hour, time.Minute)
	meter := &fakeMeter{}
	session, peer := newFakeLiveSession(), newFakeLivePeer()
	dial, _ := dialOnce(session)
	done := runLiveCallBilled(t, dial, peer, LiveCallBilling{Meter: meter, StartedAt: time.Now()})

	waitFor(t, "the first minute", func() bool { return len(meter.charged()) == 1 })
	peer.controls <- LiveCallControl{Type: LiveCallControlResume}
	time.Sleep(50 * time.Millisecond)
	close(peer.audioIn)
	require.NoError(t, <-done)
	require.Equal(t, []int{1}, meter.charged())
	require.NotContains(t, peer.eventTypes(), LiveCallEventResumed)
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
	require.Equal(t, []string{"heard", "heard", "said", "said", "saved", "turn_complete", "said", "interrupted", "saved", "turn_complete"}, peer.eventTypes(),
		"the chat hears each turn is saved before the turn is over")
	require.True(t, session.closed)
}

// Typing is another way to take a turn: the words reach her, she answers
// aloud, and what was typed is kept with that turn. While a minute is unpaid
// the typed words go nowhere, as spoken ones do.
func TestRunLiveCall_TypedTextIsATurnSheAnswers(t *testing.T) {
	session, peer, turns := newFakeLiveSession(), newFakeLivePeer(), &fakeLiveTurns{}
	dial, _ := dialOnce(session)
	done := runLiveCallAsync(t, context.Background(), dial, peer, turns)

	peer.controls <- LiveCallControl{Type: LiveCallControlText, Text: "  where are you?  "}
	peer.controls <- LiveCallControl{Type: LiveCallControlText, Text: "   "}
	waitFor(t, "the typed words to reach her", func() bool { return len(session.sentTexts()) == 1 })
	session.events <- geminilive.Event{Kind: geminilive.EventOutputTranscript, Text: "At the harbour."}
	session.events <- geminilive.Event{Kind: geminilive.EventTurnComplete}
	waitFor(t, "the turn to be saved", func() bool { return len(turns.savedTurns()) == 1 })
	close(peer.audioIn)
	require.NoError(t, <-done)

	require.Equal(t, []string{"where are you?"}, session.sentTexts(), "trimmed, and blank text is not a turn")
	require.Equal(t, []savedTurn{{"where are you?", "At the harbour."}}, turns.savedTurns())
}

// Typing while she is still talking starts a new turn. Kept with the turn in
// progress, the typed words would be saved ahead of what she had already
// said, and the chat would show the caller answering something not yet asked.
func TestRunLiveCall_TypingWhileSheTalksKeepsTheOrder(t *testing.T) {
	session, peer, turns := newFakeLiveSession(), newFakeLivePeer(), &fakeLiveTurns{}
	dial, _ := dialOnce(session)
	done := runLiveCallAsync(t, context.Background(), dial, peer, turns)

	session.events <- geminilive.Event{Kind: geminilive.EventOutputTranscript, Text: "Good, thanks."}
	waitFor(t, "her words to reach the caller", func() bool { return slices.Contains(peer.eventTypes(), LiveCallEventSaid) })
	peer.controls <- LiveCallControl{Type: LiveCallControlText, Text: "wait, where are you?"}
	waitFor(t, "the typed words to reach her", func() bool { return len(session.sentTexts()) == 1 })
	session.events <- geminilive.Event{Kind: geminilive.EventOutputTranscript, Text: "At the harbour."}
	session.events <- geminilive.Event{Kind: geminilive.EventTurnComplete}
	waitFor(t, "the typed turn to be saved", func() bool {
		saved := turns.savedTurns()
		return len(saved) > 0 && saved[len(saved)-1].heard != ""
	})
	close(peer.audioIn)
	require.NoError(t, <-done)

	require.Equal(t, []savedTurn{{"", "Good, thanks."}, {"wait, where are you?", "At the harbour."}}, turns.savedTurns(),
		"what she said before the caller typed is saved first, and the typed words start the next turn")
}

func TestRunLiveCall_TypedTextWhileUnpaidReachesNobody(t *testing.T) {
	withShortCallTimes(t, time.Hour, time.Minute)
	meter := &fakeMeter{refuse: true}
	session, peer := newFakeLiveSession(), newFakeLivePeer()
	dial, _ := dialOnce(session)
	done := runLiveCallBilled(t, dial, peer, LiveCallBilling{Meter: meter, StartedAt: time.Now()})

	waitFor(t, "the pause", func() bool { return slices.Contains(peer.eventTypes(), LiveCallEventPaused) })
	peer.controls <- LiveCallControl{Type: LiveCallControlText, Text: "hello?"}
	time.Sleep(50 * time.Millisecond)
	close(peer.audioIn)
	require.NoError(t, <-done)
	require.Empty(t, session.sentTexts())
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
		require.True(t, m.ViaCall, "%q was said on a call and is not marked as such", m.Content)
	}
	require.Equal(t, []string{"user: How are you?", "assistant: Good, thanks.", "assistant: Oh, and"}, got)
	require.ErrorIs(t, f.service.SaveCallTurn(ctx, f.userID+1000, f.conversation.ID, "hi", ""), ErrNotFound)
}

type sceneStateRecorder struct {
	calls     int
	audiences [][]TurnAudience
	lastSeen  string
}

func (r *sceneStateRecorder) PrepareForGeneration(_ context.Context, _, _ int, _ *models.BotPersona, history []*models.BotMessage, audience ...TurnAudience) (*models.OmniChatConversationSceneState, error) {
	r.calls++
	r.audiences = append(r.audiences, audience)
	if len(history) > 0 {
		r.lastSeen = history[len(history)-1].Content
	}
	return nil, nil
}

func TestFinishLiveCall_ExtractsTheSceneOnceForAPersonaThatPerformsOne(t *testing.T) {
	f := newLiveCallFixture(t, "Game Master", "You run a fantasy campaign.")
	ctx := context.Background()
	require.NoError(t, f.service.SaveCallTurn(ctx, f.userID, f.conversation.ID, "I open the door.", "It creaks open onto a dark hall."))
	recorder := &sceneStateRecorder{}
	f.service.SetConversationSceneStateCoordinator(recorder)

	f.service.FinishLiveCall(ctx, f.userID, f.conversation.ID)

	require.Equal(t, 1, recorder.calls)
	require.Empty(t, recorder.audiences[0], "not Heard: the call is over, so this is the full extraction it put off")
	require.Equal(t, "It creaks open onto a dark hall.", recorder.lastSeen, "the extraction reads through the last thing said on the call")

	f.service.FinishLiveCall(ctx, f.userID+1000, f.conversation.ID)
	require.Equal(t, 1, recorder.calls, "somebody else's conversation is never touched")
}

func TestFinishLiveCall_LeavesAnOmniAIAlone(t *testing.T) {
	f := newLiveCallFixture(t, "Sadie", "You are Sadie.")
	ctx := context.Background()
	persona, err := f.service.personaRepo.CreateOwned(ctx, f.userID, &models.BotPersona{
		Slug: fmt.Sprintf("u%d-dm-%d", f.userID, time.Now().UnixNano()), Name: "Sadie",
		Category: models.PersonaCategoryOriginal, Visibility: "private", SourceFormat: "native",
		SystemPrompt: "You are Sadie.", ResponseStyleProfile: models.ResponseStyleProfileDirectMessage,
		AlternateGreetings: []string{}, Tags: []string{}, GalleryURLs: []string{}, ExtensionsJSON: json.RawMessage(`{}`),
	}, 100)
	require.NoError(t, err)
	conversation, err := f.service.convRepo.CreateWithMessages(ctx, f.userID, persona.ID, nil, nil, nil)
	require.NoError(t, err)
	require.NoError(t, f.service.SaveCallTurn(ctx, f.userID, conversation.ID, "Hi", "Hey you."))
	recorder := &sceneStateRecorder{}
	f.service.SetConversationSceneStateCoordinator(recorder)

	f.service.FinishLiveCall(ctx, f.userID, conversation.ID)
	require.Zero(t, recorder.calls, "an OmniAI has no scene to update")
}

func TestRecallForCall_NoTopicIsNothingToRemember(t *testing.T) {
	f := newLiveCallFixture(t, "Sadie", "You are Sadie.")
	result := f.service.RecallForCall(context.Background(), f.userID, &LiveCallPlan{ConversationID: f.conversation.ID, PersonaName: "Sadie"}, "   ")
	require.Equal(t, false, result["found"])
}

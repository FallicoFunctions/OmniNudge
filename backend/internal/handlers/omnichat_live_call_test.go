package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	ws "github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/geminilive"
	"github.com/stretchr/testify/require"
)

type liveCallsFake struct {
	mu      sync.Mutex
	session *models.OmniChatCallSession
	claimed bool
	ended   int
}

func (f *liveCallsFake) GetActiveCallOwned(_ context.Context, id uuid.UUID, userID int) (*models.OmniChatCallSession, error) {
	if f.session == nil || f.session.ID != id || f.session.UserID != userID {
		return nil, nil
	}
	return f.session, nil
}

func (f *liveCallsFake) ClaimLiveCallOwned(context.Context, uuid.UUID, int, string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.claimed {
		return false, nil
	}
	f.claimed = true
	return true, nil
}

func (f *liveCallsFake) EndCallOwned(context.Context, uuid.UUID, int) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.ended++
	return true, nil
}

func (f *liveCallsFake) endedCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.ended
}

type liveCallChatFake struct {
	mu         sync.Mutex
	prepareErr error
	prepared   []int
	finished   []int
	saved      []string
}

func (f *liveCallChatFake) PrepareLiveCall(_ context.Context, _, conversationID int) (*services.LiveCallPlan, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.prepared = append(f.prepared, conversationID)
	if f.prepareErr != nil {
		return nil, f.prepareErr
	}
	return &services.LiveCallPlan{ConversationID: conversationID, Instruction: "You are Sadie."}, nil
}

func (f *liveCallChatFake) FinishLiveCall(_ context.Context, _, conversationID int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.finished = append(f.finished, conversationID)
}

func (f *liveCallChatFake) RecallForCall(context.Context, int, *services.LiveCallPlan, string) map[string]any {
	return map[string]any{"found": false}
}

func (f *liveCallChatFake) SaveCallTurn(_ context.Context, _, _ int, heard, said string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.saved = append(f.saved, heard+"|"+said)
	return nil
}

func (f *liveCallChatFake) snapshot() (prepared, finished []int, saved []string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]int(nil), f.prepared...), append([]int(nil), f.finished...), append([]string(nil), f.saved...)
}

type handlerLiveSession struct {
	events chan geminilive.Event
	mu     sync.Mutex
	audio  [][]byte
}

func (s *handlerLiveSession) Events() <-chan geminilive.Event { return s.events }
func (s *handlerLiveSession) SendAudio(pcm []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.audio = append(s.audio, pcm)
	return nil
}
func (s *handlerLiveSession) RespondToTool(geminilive.FunctionCall, any) error { return nil }
func (s *handlerLiveSession) Close() error                                     { return nil }
func (s *handlerLiveSession) Err() error                                       { return nil }
func (s *handlerLiveSession) received() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.audio)
}

func liveCallRouter(handler *OmniChatLiveCallHandler, before ...gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(before...)
	router.GET("/omnichat/calls/:call_id/live", func(c *gin.Context) {
		c.Set("user_id", 9)
		handler.Connect(c)
	})
	return router
}

func eventually(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestLiveCallConnect_RefusesBeforeUpgrading(t *testing.T) {
	callID := uuid.New()
	voice := &models.OmniChatCallSession{ID: callID, UserID: 9, ConversationID: 44, Mode: "voice", Status: "active"}
	video := &models.OmniChatCallSession{ID: callID, UserID: 9, ConversationID: 44, Mode: "video", Status: "active"}
	someoneElses := &models.OmniChatCallSession{ID: callID, UserID: 10, ConversationID: 44, Mode: "voice", Status: "active"}
	tests := []struct {
		name       string
		session    *models.OmniChatCallSession
		prepareErr error
		path       string
		want       int
	}{
		{name: "not a call id", session: voice, path: "/omnichat/calls/not-a-uuid/live", want: http.StatusBadRequest},
		{name: "no active call", session: nil, want: http.StatusNotFound},
		{name: "somebody else's call", session: someoneElses, want: http.StatusNotFound},
		{name: "a video call", session: video, want: http.StatusConflict},
		{name: "she blocked them", session: voice, prepareErr: services.ErrOmniChatBlockedByPersona, want: http.StatusForbidden},
		{name: "the conversation is gone", session: voice, prepareErr: services.ErrNotFound, want: http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dialed := false
			handler := NewOmniChatLiveCallHandler(&liveCallsFake{session: tt.session}, &liveCallChatFake{prepareErr: tt.prepareErr},
				func(*services.LiveCallPlan) services.LiveCallDialer {
					return func(context.Context, string) (services.LiveCallSession, error) {
						dialed = true
						return nil, nil
					}
				})
			path := tt.path
			if path == "" {
				path = "/omnichat/calls/" + callID.String() + "/live"
			}
			recorder := httptest.NewRecorder()
			liveCallRouter(handler).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
			require.Equal(t, tt.want, recorder.Code, recorder.Body.String())
			require.False(t, dialed, "Live is never dialled for a call that is refused")
		})
	}
}

// The router gives every request a thirty-second deadline. A call outlives any
// request, so a relay that ran on the request's context hung up on everybody
// thirty seconds in -- and a router built without that middleware, as the
// other tests here are, could never show it.
func TestLiveCallConnect_OutlivesTheRequestTimeout(t *testing.T) {
	callID := uuid.New()
	calls := &liveCallsFake{session: &models.OmniChatCallSession{ID: callID, UserID: 9, ConversationID: 44, Mode: "voice", Status: "active"}}
	session := &handlerLiveSession{events: make(chan geminilive.Event, 8)}
	handler := NewOmniChatLiveCallHandler(calls, &liveCallChatFake{}, func(*services.LiveCallPlan) services.LiveCallDialer {
		return func(context.Context, string) (services.LiveCallSession, error) { return session, nil }
	})
	server := httptest.NewServer(liveCallRouter(handler, middleware.Timeout(100*time.Millisecond)))
	defer server.Close()

	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/omnichat/calls/" + callID.String() + "/live"
	conn, _, err := ws.DefaultDialer.Dial(url, http.Header{"Origin": {"http://localhost:5173"}})
	require.NoError(t, err)
	defer conn.Close()

	time.Sleep(300 * time.Millisecond)
	require.Zero(t, calls.endedCount(), "the call ended when the request deadline passed")

	require.NoError(t, conn.WriteMessage(ws.BinaryMessage, []byte{5}))
	eventually(t, "audio after the request deadline to reach Live", func() bool { return session.received() == 1 })
	session.events <- geminilive.Event{Kind: geminilive.EventAudio, Audio: []byte{6}}
	conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	kind, data, err := conn.ReadMessage()
	require.NoError(t, err, "her voice after the request deadline never arrived")
	require.Equal(t, ws.BinaryMessage, kind)
	require.Equal(t, []byte{6}, data)
}

// Two tabs, or a script, opening the same call would each have opened a Live
// session on the platform's key while the call is billed once.
func TestLiveCallConnect_ASecondSocketForTheSameCallIsRefused(t *testing.T) {
	callID := uuid.New()
	calls := &liveCallsFake{session: &models.OmniChatCallSession{ID: callID, UserID: 9, ConversationID: 44, Mode: "voice", Status: "active"}}
	var dialMu sync.Mutex
	dials := 0
	handler := NewOmniChatLiveCallHandler(calls, &liveCallChatFake{}, func(*services.LiveCallPlan) services.LiveCallDialer {
		return func(context.Context, string) (services.LiveCallSession, error) {
			dialMu.Lock()
			dials++
			dialMu.Unlock()
			return &handlerLiveSession{events: make(chan geminilive.Event, 1)}, nil
		}
	})
	server := httptest.NewServer(liveCallRouter(handler))
	defer server.Close()
	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/omnichat/calls/" + callID.String() + "/live"
	origin := http.Header{"Origin": {"http://localhost:5173"}}

	first, _, err := ws.DefaultDialer.Dial(url, origin)
	require.NoError(t, err)
	defer first.Close()

	second, response, err := ws.DefaultDialer.Dial(url, origin)
	if second != nil {
		second.Close()
	}
	require.Error(t, err, "a second socket connected to a call that already has one")
	require.NotNil(t, response)
	require.Equal(t, http.StatusConflict, response.StatusCode)
	eventually(t, "the first socket's Live session", func() bool {
		dialMu.Lock()
		defer dialMu.Unlock()
		return dials == 1
	})
	time.Sleep(50 * time.Millisecond)
	dialMu.Lock()
	require.Equal(t, 1, dials, "only one Live session was opened")
	dialMu.Unlock()
}

func TestLiveCallConnect_RelaysAudioAndEndsTheCallWhenTheBrowserHangsUp(t *testing.T) {
	callID := uuid.New()
	calls := &liveCallsFake{session: &models.OmniChatCallSession{ID: callID, UserID: 9, ConversationID: 44, Mode: "voice", Status: "active"}}
	chat := &liveCallChatFake{}
	session := &handlerLiveSession{events: make(chan geminilive.Event, 8)}
	handler := NewOmniChatLiveCallHandler(calls, chat, func(plan *services.LiveCallPlan) services.LiveCallDialer {
		require.Equal(t, 44, plan.ConversationID)
		return func(context.Context, string) (services.LiveCallSession, error) { return session, nil }
	})
	server := httptest.NewServer(liveCallRouter(handler))
	defer server.Close()

	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/omnichat/calls/" + callID.String() + "/live"
	conn, _, err := ws.DefaultDialer.Dial(url, http.Header{"Origin": {"http://localhost:5173"}})
	require.NoError(t, err)

	require.NoError(t, conn.WriteMessage(ws.BinaryMessage, []byte{1, 2, 3, 4}))
	require.NoError(t, conn.WriteMessage(ws.TextMessage, []byte(`{"not":"audio"}`)))
	eventually(t, "the caller's audio to reach Live", func() bool { return session.received() == 1 })

	session.events <- geminilive.Event{Kind: geminilive.EventAudio, Audio: []byte{7, 7}}
	session.events <- geminilive.Event{Kind: geminilive.EventOutputTranscript, Text: "Hey you."}

	conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	kind, data, err := conn.ReadMessage()
	require.NoError(t, err)
	require.Equal(t, ws.BinaryMessage, kind)
	require.Equal(t, []byte{7, 7}, data)
	kind, data, err = conn.ReadMessage()
	require.NoError(t, err)
	require.Equal(t, ws.TextMessage, kind)
	var event services.LiveCallEvent
	require.NoError(t, json.Unmarshal(data, &event))
	require.Equal(t, services.LiveCallEvent{Type: services.LiveCallEventSaid, Text: "Hey you."}, event)

	require.NoError(t, conn.Close())
	eventually(t, "the call to be marked ended", func() bool { return calls.endedCount() == 1 })
	eventually(t, "the scene update after the call", func() bool {
		_, finished, _ := chat.snapshot()
		return len(finished) == 1
	})
	prepared, finished, saved := chat.snapshot()
	require.Equal(t, []int{44}, prepared)
	require.Equal(t, []int{44}, finished)
	require.Equal(t, []string{"|Hey you."}, saved, "what she said before the hang-up is kept")
}

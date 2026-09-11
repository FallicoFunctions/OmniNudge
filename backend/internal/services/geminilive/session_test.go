package geminilive

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// fakeLive is a stand-in Live server. handle runs after the setup frame has
// been read; it returns the setup so the test can inspect what was sent.
func fakeLive(t *testing.T, handle func(conn *websocket.Conn)) (endpoint string, setups <-chan map[string]any, keys <-chan string) {
	t.Helper()
	setupCh := make(chan map[string]any, 1)
	keyCh := make(chan string, 1)
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		keyCh <- r.Header.Get("x-goog-api-key")
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		var first map[string]any
		if err := conn.ReadJSON(&first); err != nil {
			return
		}
		setupCh <- first
		handle(conn)
	}))
	t.Cleanup(server.Close)
	return "ws" + strings.TrimPrefix(server.URL, "http"), setupCh, keyCh
}

func accept(conn *websocket.Conn) {
	_ = conn.WriteJSON(map[string]any{"setupComplete": map[string]any{}})
}

func TestDial_SendsSetupAndKeyHeader(t *testing.T) {
	endpoint, setups, keys := fakeLive(t, func(conn *websocket.Conn) {
		accept(conn)
		_, _, _ = conn.ReadMessage()
	})
	session, err := Dial(context.Background(), Config{
		APIKey:            "test-key",
		Model:             "gemini-3.1-flash-live-preview",
		Voice:             "Sulafat",
		SystemInstruction: "You are Sadie.",
		Tools:             []FunctionDeclaration{{Name: "recall_memory", Description: "Look something up."}},
		ResumeHandle:      "handle-1",
		Endpoint:          endpoint,
	})
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	defer session.Close()

	if got := <-keys; got != "test-key" {
		t.Fatalf("key header = %q, want test-key", got)
	}
	setup := (<-setups)["setup"].(map[string]any)
	raw, _ := json.Marshal(setup)
	for _, want := range []string{
		`"model":"models/gemini-3.1-flash-live-preview"`,
		`"voiceName":"Sulafat"`,
		`"text":"You are Sadie."`,
		`"name":"recall_memory"`,
		`"handle":"handle-1"`,
		`"inputAudioTranscription":{}`,
		`"outputAudioTranscription":{}`,
		`"slidingWindow":{}`,
		`"responseModalities":["AUDIO"]`,
	} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("setup is missing %s\nsetup: %s", want, raw)
		}
	}
}

func TestDial_Refusals(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		handle  func(conn *websocket.Conn)
		wantErr error
	}{
		{
			name:    "no key",
			cfg:     Config{Model: "m"},
			wantErr: ErrNotConfigured,
		},
		{
			name:    "no model",
			cfg:     Config{APIKey: "k"},
			wantErr: ErrNotConfigured,
		},
		{
			name: "server closes with a reason",
			cfg:  Config{APIKey: "k", Model: "m"},
			handle: func(conn *websocket.Conn) {
				_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(1007, "unknown voice"))
			},
			wantErr: ErrSetupRefused,
		},
		{
			name: "server answers with an error",
			cfg:  Config{APIKey: "k", Model: "m"},
			handle: func(conn *websocket.Conn) {
				_ = conn.WriteJSON(map[string]any{"error": map[string]any{"message": "bad model"}})
			},
			wantErr: ErrSetupRefused,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.handle != nil {
				endpoint, _, _ := fakeLive(t, tt.handle)
				tt.cfg.Endpoint = endpoint
			}
			_, err := Dial(context.Background(), tt.cfg)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("Dial error = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestDial_HangingUpDuringSetupReturnsAtOnce(t *testing.T) {
	endpoint, _, _ := fakeLive(t, func(conn *websocket.Conn) {
		// Never accepts: the setup just hangs, as a stalled server would.
		_, _, _ = conn.ReadMessage()
	})
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(100*time.Millisecond, cancel)

	started := time.Now()
	_, err := Dial(ctx, Config{APIKey: "k", Model: "m", Endpoint: endpoint})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Dial error = %v, want context.Canceled", err)
	}
	if waited := time.Since(started); waited > 2*time.Second {
		t.Fatalf("Dial took %s after the caller hung up, want well under the %s setup timeout", waited, setupTimeout)
	}
}

func TestSession_EventsArriveInOrder(t *testing.T) {
	endpoint, _, _ := fakeLive(t, func(conn *websocket.Conn) {
		accept(conn)
		_ = conn.WriteJSON(map[string]any{"serverContent": map[string]any{
			"inputTranscription": map[string]any{"text": "hi Sadie"},
		}})
		_ = conn.WriteJSON(map[string]any{"serverContent": map[string]any{
			"modelTurn": map[string]any{"parts": []any{map[string]any{
				// base64 of "\x01\x02\x03\x04"
				"inlineData": map[string]any{"mimeType": "audio/pcm;rate=24000", "data": "AQIDBA=="},
			}}},
			"outputTranscription": map[string]any{"text": "Hey you"},
		}})
		_ = conn.WriteJSON(map[string]any{"serverContent": map[string]any{"interrupted": true}})
		_ = conn.WriteJSON(map[string]any{"serverContent": map[string]any{"turnComplete": true}})
		_ = conn.WriteJSON(map[string]any{"sessionResumptionUpdate": map[string]any{"newHandle": "h2", "resumable": true}})
		_ = conn.WriteJSON(map[string]any{"sessionResumptionUpdate": map[string]any{"newHandle": "not-yet", "resumable": false}})
		_ = conn.WriteJSON(map[string]any{"goAway": map[string]any{"timeLeft": "10s"}})
		_ = conn.WriteJSON(map[string]any{"usageMetadata": map[string]any{"promptTokenCount": 7, "responseTokenCount": 3, "totalTokenCount": 10}})
		_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	})
	session, err := Dial(context.Background(), Config{APIKey: "k", Model: "m", Endpoint: endpoint})
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	defer session.Close()

	var got []Event
	timeout := time.After(5 * time.Second)
	for done := false; !done; {
		select {
		case event, ok := <-session.Events():
			if !ok {
				done = true
				break
			}
			got = append(got, event)
		case <-timeout:
			t.Fatal("events never closed")
		}
	}

	wantKinds := []EventKind{EventInputTranscript, EventAudio, EventOutputTranscript, EventInterrupted, EventTurnComplete, EventResumption, EventGoAway, EventUsage}
	if len(got) != len(wantKinds) {
		t.Fatalf("got %d events, want %d: %+v", len(got), len(wantKinds), got)
	}
	for i, kind := range wantKinds {
		if got[i].Kind != kind {
			t.Errorf("event %d kind = %d, want %d", i, got[i].Kind, kind)
		}
	}
	if got[0].Text != "hi Sadie" || got[2].Text != "Hey you" {
		t.Errorf("transcripts = %q / %q", got[0].Text, got[2].Text)
	}
	if string(got[1].Audio) != "\x01\x02\x03\x04" {
		t.Errorf("audio = %v, want the decoded PCM bytes", got[1].Audio)
	}
	if got[5].ResumeHandle != "h2" {
		t.Errorf("resume handle = %q, want h2 (an unresumable handle must not surface)", got[5].ResumeHandle)
	}
	if got[6].TimeLeft != "10s" || got[7].Usage.TotalTokenCount != 10 {
		t.Errorf("goAway/usage = %q / %+v", got[6].TimeLeft, got[7].Usage)
	}
	if err := session.Err(); err != nil {
		t.Errorf("Err after a clean close = %v, want nil", err)
	}
}

func TestSession_ToolCallRoundTrip(t *testing.T) {
	responses := make(chan map[string]any, 1)
	endpoint, _, _ := fakeLive(t, func(conn *websocket.Conn) {
		accept(conn)
		_ = conn.WriteJSON(map[string]any{"toolCall": map[string]any{"functionCalls": []any{map[string]any{
			"id": "call-1", "name": "recall_memory", "args": map[string]any{"topic": "the job interview"},
		}}}})
		var reply map[string]any
		if err := conn.ReadJSON(&reply); err == nil {
			responses <- reply
		}
	})
	session, err := Dial(context.Background(), Config{APIKey: "k", Model: "m", Endpoint: endpoint})
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	defer session.Close()

	event := <-session.Events()
	if event.Kind != EventToolCall || len(event.Calls) != 1 {
		t.Fatalf("first event = %+v, want one tool call", event)
	}
	call := event.Calls[0]
	var args struct{ Topic string }
	if err := json.Unmarshal(call.Args, &args); err != nil || args.Topic != "the job interview" {
		t.Fatalf("args = %s (%v)", call.Args, err)
	}
	if err := session.RespondToTool(call, map[string]any{"memories": []string{"It went well."}}); err != nil {
		t.Fatalf("RespondToTool: %v", err)
	}

	select {
	case reply := <-responses:
		raw, _ := json.Marshal(reply)
		want := `{"toolResponse":{"functionResponses":[{"id":"call-1","name":"recall_memory","response":{"memories":["It went well."]}}]}}`
		if string(raw) != want {
			t.Fatalf("tool response = %s\nwant          %s", raw, want)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the server never received the tool response")
	}
}

func TestSession_AudioIsBase64PCMAt16k(t *testing.T) {
	frames := make(chan map[string]any, 2)
	endpoint, _, _ := fakeLive(t, func(conn *websocket.Conn) {
		accept(conn)
		for range 2 {
			var frame map[string]any
			if err := conn.ReadJSON(&frame); err != nil {
				return
			}
			frames <- frame
		}
	})
	session, err := Dial(context.Background(), Config{APIKey: "k", Model: "m", Endpoint: endpoint})
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	defer session.Close()

	if err := session.SendAudio([]byte{1, 2, 3, 4}); err != nil {
		t.Fatalf("SendAudio: %v", err)
	}
	if err := session.EndAudio(); err != nil {
		t.Fatalf("EndAudio: %v", err)
	}
	for _, want := range []string{
		`{"realtimeInput":{"audio":{"data":"AQIDBA==","mimeType":"audio/pcm;rate=16000"}}}`,
		`{"realtimeInput":{"audioStreamEnd":true}}`,
	} {
		select {
		case frame := <-frames:
			raw, _ := json.Marshal(frame)
			if string(raw) != want {
				t.Errorf("frame = %s\nwant    %s", raw, want)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("frame never arrived")
		}
	}
}

func TestSession_SendAfterCloseFails(t *testing.T) {
	endpoint, _, _ := fakeLive(t, func(conn *websocket.Conn) {
		accept(conn)
		_, _, _ = conn.ReadMessage()
	})
	session, err := Dial(context.Background(), Config{APIKey: "k", Model: "m", Endpoint: endpoint})
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	session.Close()
	session.Close()
	if err := session.SendText("hello"); !errors.Is(err, ErrClosed) {
		t.Fatalf("SendText after Close = %v, want ErrClosed", err)
	}
}

// Package geminilive is a client for the Gemini Live API: one websocket that
// hears the caller and speaks back, so an OmniChat phone call has no separate
// transcription, generation and synthesis steps to wait on.
package geminilive

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// DefaultEndpoint is the v1beta Live websocket.
	DefaultEndpoint = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"

	// InputAudioMIME is what SendAudio carries: 16-bit little-endian mono PCM.
	InputAudioMIME = "audio/pcm;rate=16000"
	// OutputSampleRate is the rate of the PCM in an EventAudio.
	OutputSampleRate = 24000

	setupTimeout   = 15 * time.Second
	writeTimeout   = 10 * time.Second
	maxServerFrame = 4 << 20
	eventBuffer    = 256
)

var (
	ErrNotConfigured = errors.New("geminilive: API key or model not configured")
	ErrSetupRefused  = errors.New("geminilive: server refused the session setup")
	ErrClosed        = errors.New("geminilive: session closed")
)

// Config describes one session. Voice is a Gemini prebuilt voice name.
type Config struct {
	APIKey            string
	Model             string
	Voice             string
	SystemInstruction string
	Tools             []FunctionDeclaration
	// ResumeHandle continues an earlier session instead of starting fresh. The
	// server hands these out in EventResumption.
	ResumeHandle string
	// Endpoint overrides DefaultEndpoint; tests point it at a local server.
	Endpoint string
}

type EventKind int

const (
	EventAudio EventKind = iota + 1
	EventInputTranscript
	EventOutputTranscript
	EventTurnComplete
	// EventInterrupted means the caller spoke over her. Audio already queued
	// for playback belongs to the abandoned reply and should be dropped.
	EventInterrupted
	EventToolCall
	EventToolCancel
	// EventGoAway warns that the server will close the connection soon.
	EventGoAway
	EventResumption
	EventUsage
)

// Event is one thing the server said. Only the fields for its Kind are set.
type Event struct {
	Kind         EventKind
	Audio        []byte // 24 kHz 16-bit mono PCM
	Text         string
	Calls        []FunctionCall
	CancelledIDs []string
	TimeLeft     string
	ResumeHandle string
	Usage        Usage
}

// Session is one open Live connection. Sends are safe from any goroutine;
// Events must be drained by one reader until it closes.
type Session struct {
	conn    *websocket.Conn
	events  chan Event
	writeMu sync.Mutex

	closeOnce sync.Once
	done      chan struct{}
	errMu     sync.Mutex
	err       error
}

// Dial opens a session and returns once the server has accepted the setup.
func Dial(ctx context.Context, cfg Config) (*Session, error) {
	if strings.TrimSpace(cfg.APIKey) == "" || strings.TrimSpace(cfg.Model) == "" {
		return nil, ErrNotConfigured
	}
	endpoint := cfg.Endpoint
	if endpoint == "" {
		endpoint = DefaultEndpoint
	}

	ctx, cancel := context.WithTimeout(ctx, setupTimeout)
	defer cancel()

	header := http.Header{}
	header.Set("x-goog-api-key", cfg.APIKey)
	dialer := &websocket.Dialer{HandshakeTimeout: setupTimeout}
	conn, resp, err := dialer.DialContext(ctx, endpoint, header)
	if err != nil {
		if resp != nil {
			return nil, fmt.Errorf("geminilive: dial failed with HTTP %d: %w", resp.StatusCode, err)
		}
		return nil, fmt.Errorf("geminilive: dial failed: %w", err)
	}
	conn.SetReadLimit(maxServerFrame)
	// A read deadline only covers the timeout; a caller who hangs up during
	// setup cancels ctx, and only closing the socket unblocks the read.
	stopWatching := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stopWatching()

	s := &Session{conn: conn, events: make(chan Event, eventBuffer), done: make(chan struct{})}
	err = s.write(clientMessage{Setup: buildSetup(cfg)})
	if err == nil {
		err = s.awaitSetup(ctx)
	}
	if err != nil {
		_ = conn.Close()
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, fmt.Errorf("geminilive: setup abandoned: %w", ctxErr)
		}
		return nil, err
	}
	go s.readLoop()
	return s, nil
}

// Live bills the whole context again on every turn, and audio adds about
// 3,400 tokens a minute. Left at the default, a long call's later turns cost
// more than the minute is sold for. Compressing at 20k down to 10k holds each
// turn to a few cents; the system instruction (about 2.6k) is always kept, and
// older conversation stays reachable through recall_memory.
const (
	compressionTriggerTokens = 20_000
	compressionTargetTokens  = 10_000
)

func buildSetup(cfg Config) *setupMessage {
	model := cfg.Model
	if !strings.HasPrefix(model, "models/") {
		model = "models/" + model
	}
	setup := &setupMessage{
		Model:                    model,
		GenerationConfig:         generationConfig{ResponseModalities: []string{"AUDIO"}},
		InputAudioTranscription:  &struct{}{},
		OutputAudioTranscription: &struct{}{},
		// Without compression an audio session ends at 15 minutes; with it the
		// oldest turns fall away and the call carries on.
		ContextWindowCompression: &contextCompression{
			TriggerTokens: compressionTriggerTokens,
			SlidingWindow: slidingWindow{TargetTokens: compressionTargetTokens},
		},
		SessionResumption: &sessionResumptionCfg{Handle: cfg.ResumeHandle},
	}
	if cfg.Voice != "" {
		setup.GenerationConfig.SpeechConfig = &speechConfig{VoiceConfig: voiceConfig{PrebuiltVoiceConfig: prebuiltVoice{VoiceName: cfg.Voice}}}
	}
	if cfg.SystemInstruction != "" {
		setup.SystemInstruction = &content{Parts: []textPart{{Text: cfg.SystemInstruction}}}
	}
	if len(cfg.Tools) > 0 {
		setup.Tools = []toolSet{{FunctionDeclarations: cfg.Tools}}
	}
	return setup
}

func (s *Session) awaitSetup(ctx context.Context) error {
	deadline, _ := ctx.Deadline()
	if err := s.conn.SetReadDeadline(deadline); err != nil {
		return fmt.Errorf("geminilive: waiting for setup: %w", err)
	}
	defer func() { _ = s.conn.SetReadDeadline(time.Time{}) }()
	for {
		msg, err := s.read()
		if err != nil {
			var closeErr *websocket.CloseError
			if errors.As(err, &closeErr) {
				// The server closes with a reason when it rejects the setup,
				// such as an unknown model or voice.
				return fmt.Errorf("%w: %s", ErrSetupRefused, closeErr.Text)
			}
			return fmt.Errorf("geminilive: waiting for setup: %w", err)
		}
		if msg.Error != nil {
			return fmt.Errorf("%w: %s", ErrSetupRefused, truncate(string(*msg.Error), 300))
		}
		if msg.SetupComplete != nil {
			return nil
		}
	}
}

func (s *Session) readLoop() {
	defer close(s.events)
	defer s.shutdown(nil)
	for {
		msg, err := s.read()
		if err != nil {
			s.shutdown(err)
			return
		}
		if msg.Error != nil {
			s.shutdown(fmt.Errorf("geminilive: server error: %s", truncate(string(*msg.Error), 300)))
			return
		}
		for _, event := range eventsFrom(msg) {
			select {
			case s.events <- event:
			case <-s.done:
				return
			}
		}
	}
}

func eventsFrom(msg serverMessage) []Event {
	var out []Event
	if sc := msg.ServerContent; sc != nil {
		if sc.InputTranscription != nil && sc.InputTranscription.Text != "" {
			out = append(out, Event{Kind: EventInputTranscript, Text: sc.InputTranscription.Text})
		}
		if sc.ModelTurn != nil {
			for _, part := range sc.ModelTurn.Parts {
				if part.InlineData != nil && strings.HasPrefix(part.InlineData.MimeType, "audio/") && len(part.InlineData.Data) > 0 {
					out = append(out, Event{Kind: EventAudio, Audio: part.InlineData.Data})
				}
			}
		}
		if sc.OutputTranscription != nil && sc.OutputTranscription.Text != "" {
			out = append(out, Event{Kind: EventOutputTranscript, Text: sc.OutputTranscription.Text})
		}
		if sc.Interrupted {
			out = append(out, Event{Kind: EventInterrupted})
		}
		if sc.TurnComplete {
			out = append(out, Event{Kind: EventTurnComplete})
		}
	}
	if msg.ToolCall != nil && len(msg.ToolCall.FunctionCalls) > 0 {
		out = append(out, Event{Kind: EventToolCall, Calls: msg.ToolCall.FunctionCalls})
	}
	if msg.ToolCallCancellation != nil {
		out = append(out, Event{Kind: EventToolCancel, CancelledIDs: msg.ToolCallCancellation.IDs})
	}
	if msg.GoAway != nil {
		out = append(out, Event{Kind: EventGoAway, TimeLeft: msg.GoAway.TimeLeft})
	}
	if u := msg.SessionResumptionUpdate; u != nil && u.Resumable && u.NewHandle != "" {
		out = append(out, Event{Kind: EventResumption, ResumeHandle: u.NewHandle})
	}
	if msg.UsageMetadata != nil {
		out = append(out, Event{Kind: EventUsage, Usage: *msg.UsageMetadata})
	}
	return out
}

func (s *Session) read() (serverMessage, error) {
	_, raw, err := s.conn.ReadMessage()
	if err != nil {
		return serverMessage{}, err
	}
	var msg serverMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		return serverMessage{}, fmt.Errorf("geminilive: undecodable server frame: %w", err)
	}
	return msg, nil
}

// Events delivers what the server says, in order. It closes when the session
// ends; Err then says why.
func (s *Session) Events() <-chan Event { return s.events }

// SendAudio streams a chunk of the caller's microphone as 16 kHz PCM.
func (s *Session) SendAudio(pcm []byte) error {
	if len(pcm) == 0 {
		return nil
	}
	return s.write(clientMessage{RealtimeInput: &realtimeInputMessage{Audio: &blob{MimeType: InputAudioMIME, Data: pcm}}})
}

// EndAudio tells the server the microphone paused, so it stops waiting for
// more speech instead of holding the turn open.
func (s *Session) EndAudio() error {
	return s.write(clientMessage{RealtimeInput: &realtimeInputMessage{AudioStreamEnd: true}})
}

// SendText speaks a typed line into the call as the caller.
func (s *Session) SendText(text string) error {
	if strings.TrimSpace(text) == "" {
		return nil
	}
	return s.write(clientMessage{RealtimeInput: &realtimeInputMessage{Text: text}})
}

// RespondToTool answers one FunctionCall. On 3.1 the model waits for this
// before it speaks again, so it has to be quick.
func (s *Session) RespondToTool(call FunctionCall, response any) error {
	return s.write(clientMessage{ToolResponse: &toolResponseMessage{
		FunctionResponses: []functionResponse{{ID: call.ID, Name: call.Name, Response: response}},
	}})
}

func (s *Session) write(msg clientMessage) error {
	select {
	case <-s.done:
		return ErrClosed
	default:
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := s.conn.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
		return err
	}
	if err := s.conn.WriteJSON(msg); err != nil {
		return fmt.Errorf("geminilive: write failed: %w", err)
	}
	return nil
}

// Close ends the session. It is safe to call more than once.
func (s *Session) Close() error {
	s.shutdown(nil)
	return nil
}

// Err reports why the session ended: nil for a Close or a clean server close.
func (s *Session) Err() error {
	s.errMu.Lock()
	defer s.errMu.Unlock()
	return s.err
}

func (s *Session) shutdown(cause error) {
	s.closeOnce.Do(func() {
		if cause != nil && !websocket.IsCloseError(cause, websocket.CloseNormalClosure) {
			s.errMu.Lock()
			s.err = cause
			s.errMu.Unlock()
		}
		close(s.done)
		s.writeMu.Lock()
		_ = s.conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
		s.writeMu.Unlock()
		_ = s.conn.Close()
	})
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

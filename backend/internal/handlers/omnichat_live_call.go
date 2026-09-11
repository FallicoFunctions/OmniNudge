package handlers

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	ws "github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	zlog "github.com/rs/zerolog/log"
)

const (
	// A 100 ms chunk of 16 kHz mono PCM is 3,200 bytes; this leaves room for a
	// browser that batches, and refuses anything that is not audio.
	liveCallMaxAudioFrame = 64 << 10
	liveCallWriteTimeout  = 10 * time.Second
	liveCallAudioQueue    = 32
	// The scene update after a call is one extraction; it gets the same kind
	// of room a typed turn's extraction does, detached from the socket.
	liveCallFinishTimeout = 2 * time.Minute
	liveCallEndTimeout    = 5 * time.Second
)

type omniChatLiveCalls interface {
	GetActiveCallOwned(ctx context.Context, id uuid.UUID, userID int) (*models.OmniChatCallSession, error)
	ClaimLiveCallOwned(ctx context.Context, id uuid.UUID, userID int, socketID string) (bool, error)
	EndCallOwned(ctx context.Context, id uuid.UUID, userID int) (bool, error)
}

type omniChatLiveCallConversation interface {
	services.LiveCallTurns
	PrepareLiveCall(ctx context.Context, userID, conversationID int) (*services.LiveCallPlan, error)
	FinishLiveCall(ctx context.Context, userID, conversationID int)
}

// OmniChatLiveCallHandler carries a voice call's audio between the browser and
// Gemini Live.
type OmniChatLiveCallHandler struct {
	calls   omniChatLiveCalls
	chat    omniChatLiveCallConversation
	dialFor func(plan *services.LiveCallPlan) services.LiveCallDialer
}

func NewOmniChatLiveCallHandler(
	calls omniChatLiveCalls,
	chat omniChatLiveCallConversation,
	dialFor func(plan *services.LiveCallPlan) services.LiveCallDialer,
) *OmniChatLiveCallHandler {
	return &OmniChatLiveCallHandler{calls: calls, chat: chat, dialFor: dialFor}
}

// Connect opens the audio socket for an active voice call.
// @Summary      Open a live voice call
// @Description  Upgrades to a WebSocket. The browser sends 16 kHz mono PCM as binary frames and receives her voice as 24 kHz mono PCM binary frames, with JSON text frames for transcripts ("heard", "said"), "interrupted" and "turn_complete".
// @Tags         OmniChat
// @Param        call_id  path  string  true  "Call session ID"
// @Success      101  {object}  gin.H  "Switching Protocols"
// @Failure      400  {object}  ErrorResponse
// @Failure      403  {object}  ErrorResponse  "The persona is not speaking to this user"
// @Failure      404  {object}  ErrorResponse  "No active call"
// @Failure      409  {object}  ErrorResponse  "Not a voice call"
// @Security     BearerAuth
// @Router       /omnichat/calls/{call_id}/live [get]
func (h *OmniChatLiveCallHandler) Connect(c *gin.Context) {
	callID, ok := parseUUIDParam(c, "call_id")
	if !ok {
		return
	}
	userID := c.GetInt("user_id")
	ctx := c.Request.Context()

	call, err := h.calls.GetActiveCallOwned(ctx, callID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to open the call")
		return
	}
	if call == nil {
		RespondError(c, http.StatusNotFound, "Active call not found")
		return
	}
	if call.Mode != "voice" {
		RespondError(c, http.StatusConflict, "Live audio is only for voice calls")
		return
	}
	plan, err := h.chat.PrepareLiveCall(ctx, userID, call.ConversationID)
	switch {
	case errors.Is(err, services.ErrNotFound):
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	case errors.Is(err, services.ErrOmniChatBlockedByPersona):
		RespondError(c, http.StatusForbidden, "This character is not taking calls from you")
		return
	case err != nil:
		RespondError(c, http.StatusInternalServerError, "Failed to open the call")
		return
	}

	// Last, so a refused call never holds the claim. Each socket would open its
	// own Live session on the platform's key while the call is billed once.
	claimed, err := h.calls.ClaimLiveCallOwned(ctx, callID, userID, uuid.NewString())
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to open the call")
		return
	}
	if !claimed {
		RespondError(c, http.StatusConflict, "This call is already connected")
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		// The upgrader has already answered the browser. The claim cannot be
		// used by anybody else now, so the call is over.
		endCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), liveCallEndTimeout)
		defer cancel()
		_, _ = h.calls.EndCallOwned(endCtx, callID, userID)
		return
	}
	socket := newLiveCallSocket(conn)
	defer socket.shutdown()
	go socket.readLoop()

	// Detached: every request carries the router's thirty-second deadline, and
	// a call is not a request. The browser closing its socket ends the call.
	callCtx := context.WithoutCancel(ctx)
	runErr := services.RunLiveCall(callCtx, userID, plan, h.dialFor(plan), socket, h.chat)
	if runErr != nil {
		zlog.Warn().Err(runErr).Str("call_id", callID.String()).Msg("omnichat live call: ended by the provider")
		socket.closeWith(ws.CloseInternalServerErr, "The call dropped")
	} else {
		socket.closeWith(ws.CloseNormalClosure, "")
	}

	// The socket is gone by now, and both of these are still owed.
	endCtx, cancel := context.WithTimeout(callCtx, liveCallEndTimeout)
	if _, err := h.calls.EndCallOwned(endCtx, callID, userID); err != nil {
		zlog.Warn().Err(err).Str("call_id", callID.String()).Msg("omnichat live call: failed to mark the call ended")
	}
	cancel()
	go func() {
		finishCtx, done := context.WithTimeout(callCtx, liveCallFinishTimeout)
		defer done()
		h.chat.FinishLiveCall(finishCtx, userID, call.ConversationID)
	}()
}

// liveCallSocket is the browser's end of a call: one reader goroutine, and
// writes serialised because the relay and the close both write.
type liveCallSocket struct {
	conn    *ws.Conn
	audio   chan []byte
	done    chan struct{}
	once    sync.Once
	writeMu sync.Mutex
}

func newLiveCallSocket(conn *ws.Conn) *liveCallSocket {
	conn.SetReadLimit(liveCallMaxAudioFrame)
	return &liveCallSocket{conn: conn, audio: make(chan []byte, liveCallAudioQueue), done: make(chan struct{})}
}

func (s *liveCallSocket) readLoop() {
	defer close(s.audio)
	for {
		kind, data, err := s.conn.ReadMessage()
		if err != nil {
			return
		}
		if kind != ws.BinaryMessage || len(data) == 0 {
			continue
		}
		select {
		case s.audio <- data:
		case <-s.done:
			return
		}
	}
}

func (s *liveCallSocket) Audio() <-chan []byte { return s.audio }

func (s *liveCallSocket) SendAudio(pcm []byte) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	s.conn.SetWriteDeadline(time.Now().Add(liveCallWriteTimeout))
	return s.conn.WriteMessage(ws.BinaryMessage, pcm)
}

func (s *liveCallSocket) SendEvent(event services.LiveCallEvent) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	s.conn.SetWriteDeadline(time.Now().Add(liveCallWriteTimeout))
	return s.conn.WriteJSON(event)
}

func (s *liveCallSocket) closeWith(code int, text string) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	_ = s.conn.WriteControl(ws.CloseMessage, ws.FormatCloseMessage(code, text), time.Now().Add(time.Second))
}

func (s *liveCallSocket) shutdown() {
	s.once.Do(func() {
		close(s.done)
		_ = s.conn.Close()
	})
}

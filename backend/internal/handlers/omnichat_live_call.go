package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	liveCallControlQueue  = 4
)

// omniChatLiveCallBilling is what paying for a call by the minute needs.
type omniChatLiveCallBilling interface {
	ReserveOwned(context.Context, int, uuid.UUID, string) (*models.OmniCreditsUsageReservation, error)
	CaptureOwned(context.Context, int, uuid.UUID) error
	RefundOwned(context.Context, int, uuid.UUID) error
}

// liveCallMinuteMeter takes one minute's credits at a time. The operation is
// the call and the minute, so charging a minute again -- a retry, or a resume
// after the caller bought credits -- is the same charge, never a second one.
type liveCallMinuteMeter struct {
	billing omniChatLiveCallBilling
	userID  int
	callID  uuid.UUID
}

func (m liveCallMinuteMeter) operation(minute int) uuid.UUID {
	return uuid.NewSHA1(m.callID, []byte(fmt.Sprintf("call-minute-%d", minute)))
}

func (m liveCallMinuteMeter) ChargeMinute(ctx context.Context, minute int) error {
	operation := m.operation(minute)
	if _, err := m.billing.ReserveOwned(ctx, m.userID, operation, models.OmniCreditsUsageCallMinute); err != nil {
		return err
	}
	if err := m.billing.CaptureOwned(ctx, m.userID, operation); err != nil {
		// Held but not taken: give it back rather than leave it in limbo.
		if refundErr := m.billing.RefundOwned(ctx, m.userID, operation); refundErr != nil {
			zlog.Error().Err(refundErr).Str("call_id", m.callID.String()).Int("minute", minute).Msg("omnichat live call: failed to refund a minute that was not captured")
		}
		return err
	}
	return nil
}

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
	billing omniChatLiveCallBilling
}

func NewOmniChatLiveCallHandler(
	calls omniChatLiveCalls,
	chat omniChatLiveCallConversation,
	dialFor func(plan *services.LiveCallPlan) services.LiveCallDialer,
) *OmniChatLiveCallHandler {
	return &OmniChatLiveCallHandler{calls: calls, chat: chat, dialFor: dialFor}
}

// SetBilling wires the per-minute charge. Without it no call is carried.
func (h *OmniChatLiveCallHandler) SetBilling(billing omniChatLiveCallBilling) *OmniChatLiveCallHandler {
	h.billing = billing
	return h
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
		zlog.Error().Err(err).Str("call_id", callID.String()).Msg("omnichat live call: failed to read the call")
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
		zlog.Error().Err(err).Str("call_id", callID.String()).Msg("omnichat live call: failed to prepare the call")
		RespondError(c, http.StatusInternalServerError, "Failed to open the call")
		return
	}

	// A call is paid by the minute; without billing it is not carried at all,
	// never carried free.
	if h.billing == nil {
		RespondError(c, http.StatusServiceUnavailable, "Voice calls are not available right now")
		return
	}

	// Last, so a refused call never holds the claim. Each socket would open its
	// own Live session on the platform's key while the call is billed once.
	claimed, err := h.calls.ClaimLiveCallOwned(ctx, callID, userID, uuid.NewString())
	if err != nil {
		zlog.Error().Err(err).Str("call_id", callID.String()).Msg("omnichat live call: failed to claim the call")
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
	runErr := services.RunLiveCall(callCtx, userID, plan, h.dialFor(plan), socket, h.chat, services.LiveCallBilling{
		Meter:     liveCallMinuteMeter{billing: h.billing, userID: userID, callID: callID},
		StartedAt: call.StartedAt,
	})
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
	conn     *ws.Conn
	audio    chan []byte
	controls chan services.LiveCallControl
	done     chan struct{}
	once     sync.Once
	writeMu  sync.Mutex
}

func newLiveCallSocket(conn *ws.Conn) *liveCallSocket {
	conn.SetReadLimit(liveCallMaxAudioFrame)
	return &liveCallSocket{
		conn:     conn,
		audio:    make(chan []byte, liveCallAudioQueue),
		controls: make(chan services.LiveCallControl, liveCallControlQueue),
		done:     make(chan struct{}),
	}
}

// readLoop sorts the browser's frames: binary is her caller's voice, text is a
// control. Anything else is ignored.
func (s *liveCallSocket) readLoop() {
	defer close(s.audio)
	defer close(s.controls)
	for {
		kind, data, err := s.conn.ReadMessage()
		if err != nil {
			return
		}
		switch {
		case kind == ws.BinaryMessage && len(data) > 0:
			select {
			case s.audio <- data:
			case <-s.done:
				return
			}
		case kind == ws.TextMessage:
			var control services.LiveCallControl
			if json.Unmarshal(data, &control) != nil || control.Type == "" {
				continue
			}
			// A control queue that is full is one the relay has not read; a
			// second identical request adds nothing.
			select {
			case s.controls <- control:
			default:
			}
		}
	}
}

func (s *liveCallSocket) Audio() <-chan []byte { return s.audio }

func (s *liveCallSocket) Controls() <-chan services.LiveCallControl { return s.controls }

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

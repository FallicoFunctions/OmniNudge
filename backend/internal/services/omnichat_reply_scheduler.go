package services

import (
	"context"
	"sync"
	"time"

	"github.com/omninudge/backend/internal/models"

	zlog "github.com/rs/zerolog/log"
)

// OmniChatReplyScheduler decides when a persona answers, which is not the same
// moment the message arrived.
//
// It lives in the server process on purpose. Replies stream token by token over
// the websocket hub, and the hub holds its clients in memory, so a reply
// generated anywhere else would arrive with no one connected to receive it.
// Moving this to the job queue would silently cost every user live streaming.
//
// One pending reply per conversation, and scheduling replaces whatever was
// already pending. That replacement is the whole coalescing rule: three
// messages sent in a row rearm the same timer instead of queueing three
// answers, so she reads the burst and responds once.
//
// Nothing here is durable. A restart drops pending replies, and the user turn
// they would have answered is left dangling -- which is the case
// RepairStaleDanglingUserTurn already exists to clean up on the next send. That
// is an acceptable trade while delays are seconds. It stops being acceptable
// when a delay can be an hour, and that is the point to give pending replies a
// table rather than to give this one now.
type OmniChatReplyScheduler struct {
	mu      sync.Mutex
	pending map[int]*pendingReply
	// generating is which conversations are mid-reply. A conversation answers
	// one turn at a time: a message arriving while she is already writing must
	// wait for that reply rather than race it, or one exchange gets two
	// answers, each written without knowing about the other.
	generating map[int]struct{}
	replier    omniChatReplier
	// afterFunc is time.AfterFunc in production. Tests replace it so a
	// scheduled reply can be made to fire without waiting for a clock.
	afterFunc func(time.Duration, func()) replyTimer
	closed    bool
}

type omniChatReplier interface {
	GenerateReply(ctx context.Context, userID, conversationID int) (*models.BotMessage, error)
}

type replyTimer interface {
	Stop() bool
}

type pendingReply struct {
	timer  replyTimer
	userID int
	// onDone reports what became of this reply exactly once: true when it was
	// generated, false when it was superseded, cancelled, or dropped at
	// shutdown. Callers use it to settle whatever they were holding open on the
	// reply's behalf -- an allowance lease, most of all, since a burst that
	// coalesces into one answer must give back the messages it did not spend.
	onDone func(delivered bool)
}

// settle runs onDone once and never again. Superseding and firing can otherwise
// both reach for the same entry.
func (p *pendingReply) settle(delivered bool) {
	if p == nil || p.onDone == nil {
		return
	}
	done := p.onDone
	p.onDone = nil
	done(delivered)
}

// NewOmniChatReplyScheduler builds a scheduler over whatever produces replies.
func NewOmniChatReplyScheduler(replier omniChatReplier) *OmniChatReplyScheduler {
	return &OmniChatReplyScheduler{
		pending:    make(map[int]*pendingReply),
		generating: make(map[int]struct{}),
		replier:    replier,
		afterFunc: func(d time.Duration, f func()) replyTimer {
			return time.AfterFunc(d, f)
		},
	}
}

// Schedule arranges for a reply to this conversation after delay, replacing any
// reply already pending for it.
//
// A zero delay still goes through the timer rather than running inline. The
// caller is an HTTP handler that is about to return, and generation takes as
// long as the model takes; running it inline would put it back on the request
// this whole layer exists to get it off.
func (s *OmniChatReplyScheduler) Schedule(userID, conversationID int, delay time.Duration, onDone func(delivered bool)) {
	if s == nil || conversationID < 1 || userID < 1 {
		if onDone != nil {
			onDone(false)
		}
		return
	}
	if delay < 0 {
		delay = 0
	}
	if s.replier == nil {
		// A wiring mistake, not a runtime condition. Arming a timer that cannot
		// be serviced would turn it into a reply that never arrives and never
		// explains itself.
		zlog.Error().Int("conversation_id", conversationID).
			Msg("omnichat: reply scheduler has no generator; dropping scheduled reply")
		if onDone != nil {
			onDone(false)
		}
		return
	}
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		if onDone != nil {
			onDone(false)
		}
		return
	}
	superseded := s.pending[conversationID]
	if superseded != nil {
		superseded.timer.Stop()
		delete(s.pending, conversationID)
	}
	entry := &pendingReply{userID: userID, onDone: onDone}
	entry.timer = s.afterFunc(delay, func() { s.fire(conversationID) })
	s.pending[conversationID] = entry
	s.mu.Unlock()

	// Outside the lock: settling talks to the database.
	superseded.settle(false)
}

// Cancel drops any pending reply for a conversation. Used when the thing the
// reply was for no longer exists.
func (s *OmniChatReplyScheduler) Cancel(conversationID int) {
	if s == nil {
		return
	}
	s.mu.Lock()
	entry := s.pending[conversationID]
	if entry != nil {
		entry.timer.Stop()
		delete(s.pending, conversationID)
	}
	s.mu.Unlock()
	entry.settle(false)
}

// Pending reports whether a reply is waiting for this conversation.
func (s *OmniChatReplyScheduler) Pending(conversationID int) bool {
	if s == nil {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.pending[conversationID]
	return ok
}

// Close stops every pending reply and refuses further scheduling. Shutdown
// leaves the user turns dangling, which the repair path handles.
func (s *OmniChatReplyScheduler) Close() {
	if s == nil {
		return
	}
	s.mu.Lock()
	s.closed = true
	dropped := make([]*pendingReply, 0, len(s.pending))
	for conversationID, entry := range s.pending {
		entry.timer.Stop()
		dropped = append(dropped, entry)
		delete(s.pending, conversationID)
	}
	s.mu.Unlock()
	for _, entry := range dropped {
		entry.settle(false)
	}
}

func (s *OmniChatReplyScheduler) fire(conversationID int) {
	s.mu.Lock()
	entry, ok := s.pending[conversationID]
	if !ok || s.closed {
		s.mu.Unlock()
		return
	}
	userID := entry.userID
	if _, busy := s.generating[conversationID]; busy {
		// She is still writing the previous one. Leave this pending and look
		// again shortly; the follow-up is answered after the answer it follows,
		// which is also the order a person would do it in.
		entry.timer = s.afterFunc(omniChatReplyBusyRetry, func() { s.fire(conversationID) })
		s.mu.Unlock()
		return
	}
	delete(s.pending, conversationID)
	s.generating[conversationID] = struct{}{}
	s.mu.Unlock()

	delivered := false
	defer func() { entry.settle(delivered) }()

	defer func() {
		s.mu.Lock()
		delete(s.generating, conversationID)
		s.mu.Unlock()
		// On the request path a panic here was gin's to catch and turn into a
		// 500. Nothing catches it in a detached timer, and one conversation
		// tripping over a nil should not take the process down with it.
		if recovered := recover(); recovered != nil {
			zlog.Error().Interface("panic", recovered).Int("conversation_id", conversationID).
				Msg("omnichat: scheduled reply panicked")
		}
	}()

	// Detached from any request: the one that scheduled this returned long ago.
	ctx, cancel := context.WithTimeout(context.Background(), omniChatScheduledReplyTimeout)
	defer cancel()
	reply, err := s.replier.GenerateReply(ctx, userID, conversationID)
	delivered = err == nil && reply != nil && !reply.Failed
	if err != nil {
		// The reply is already persisted as a failed turn by the generator
		// itself where it could be; anything reaching here had no turn to
		// write, so log rather than lose it silently.
		zlog.Warn().Err(err).Int("conversation_id", conversationID).
			Msg("omnichat: scheduled reply failed")
	}
}

// omniChatScheduledReplyTimeout bounds a detached reply. It is generous
// compared with the request timeout it replaces, because nothing is waiting on
// the other end of it any more.
const omniChatScheduledReplyTimeout = 5 * time.Minute

// omniChatReplyBusyRetry is how long a reply waits when the conversation is
// already mid-answer. Short, because it is only bridging the tail of a
// generation that is already running.
const omniChatReplyBusyRetry = 250 * time.Millisecond

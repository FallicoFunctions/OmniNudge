package services

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

type recordingReplier struct {
	mu            sync.Mutex
	conversations []int
	users         []int
	err           error
}

func (r *recordingReplier) GenerateReply(_ context.Context, userID, conversationID int) (*models.BotMessage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.users = append(r.users, userID)
	r.conversations = append(r.conversations, conversationID)
	if r.err != nil {
		return nil, r.err
	}
	return &models.BotMessage{ID: len(r.conversations), ConversationID: conversationID}, nil
}

func (r *recordingReplier) calls() ([]int, []int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]int(nil), r.users...), append([]int(nil), r.conversations...)
}

// manualTimer fires only when a test says so, so scheduling can be asserted
// without a sleep deciding whether the suite passes.
type manualTimer struct {
	mu      sync.Mutex
	fire    func()
	stopped bool
}

func (t *manualTimer) Stop() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.stopped {
		return false
	}
	t.stopped = true
	return true
}

func (t *manualTimer) run() {
	t.mu.Lock()
	stopped := t.stopped
	fire := t.fire
	t.mu.Unlock()
	if stopped {
		return
	}
	fire()
}

func manualScheduler(replier omniChatReplier) (*OmniChatReplyScheduler, *[]*manualTimer) {
	scheduler := NewOmniChatReplyScheduler(replier)
	timers := &[]*manualTimer{}
	var mu sync.Mutex
	scheduler.afterFunc = func(_ time.Duration, f func()) replyTimer {
		timer := &manualTimer{fire: f}
		mu.Lock()
		*timers = append(*timers, timer)
		mu.Unlock()
		return timer
	}
	return scheduler, timers
}

func TestSchedulingReplacesThePendingReplySoABurstIsAnsweredOnce(t *testing.T) {
	replier := &recordingReplier{}
	scheduler, timers := manualScheduler(replier)

	// Three messages in a row, the way people actually text, each landing inside
	// the window the one before it opened.
	scheduler.Schedule(7, 42, OmniChatSettleWindow, nil)
	scheduler.Schedule(7, 42, OmniChatSettleWindow, nil)
	scheduler.Schedule(7, 42, OmniChatSettleWindow, nil)

	require.Len(t, *timers, 3, "each message arms a timer")
	require.True(t, (*timers)[0].stopped, "an earlier reply must be cancelled, not left to fire")
	require.True(t, (*timers)[1].stopped)
	require.False(t, (*timers)[2].stopped)
	require.True(t, scheduler.Pending(42))

	// Every timer runs; only the survivor should produce anything.
	for _, timer := range *timers {
		timer.run()
	}

	users, conversations := replier.calls()
	require.Equal(t, []int{42}, conversations, "a burst is one reply, not three")
	require.Equal(t, []int{7}, users)
	require.False(t, scheduler.Pending(42), "firing clears the pending reply")
}

func TestSeparateConversationsDoNotDisplaceEachOther(t *testing.T) {
	replier := &recordingReplier{}
	scheduler, timers := manualScheduler(replier)

	scheduler.Schedule(7, 42, time.Second, nil)
	scheduler.Schedule(9, 43, time.Second, nil)

	require.True(t, scheduler.Pending(42))
	require.True(t, scheduler.Pending(43))
	for _, timer := range *timers {
		timer.run()
	}

	users, conversations := replier.calls()
	require.ElementsMatch(t, []int{42, 43}, conversations)
	require.ElementsMatch(t, []int{7, 9}, users)
}

func TestCancelAndCloseStopAPendingReplyFromEverArriving(t *testing.T) {
	replier := &recordingReplier{}
	scheduler, timers := manualScheduler(replier)

	scheduler.Schedule(7, 42, time.Second, nil)
	scheduler.Cancel(42)
	require.False(t, scheduler.Pending(42))

	scheduler.Schedule(8, 43, time.Second, nil)
	scheduler.Close()
	require.False(t, scheduler.Pending(43))

	// Scheduling after Close is refused rather than silently held forever.
	scheduler.Schedule(9, 44, time.Second, nil)
	require.False(t, scheduler.Pending(44))

	for _, timer := range *timers {
		timer.run()
	}
	_, conversations := replier.calls()
	require.Empty(t, conversations, "nothing cancelled or closed may still answer")
}

func TestAFailedScheduledReplyDoesNotLeaveTheConversationPending(t *testing.T) {
	replier := &recordingReplier{err: errors.New("provider unavailable")}
	scheduler, timers := manualScheduler(replier)

	scheduler.Schedule(7, 42, time.Second, nil)
	(*timers)[0].run()

	require.False(t, scheduler.Pending(42),
		"a conversation stuck pending would refuse every later reply to it")
	_, conversations := replier.calls()
	require.Equal(t, []int{42}, conversations)
}

// blockingReplier holds the first reply open so a second can be attempted while
// it is still running -- the case where somebody sends a follow-up mid-answer.
type blockingReplier struct {
	mu      sync.Mutex
	started int
	release chan struct{}
	done    chan struct{}
}

func (r *blockingReplier) GenerateReply(_ context.Context, _, _ int) (*models.BotMessage, error) {
	r.mu.Lock()
	r.started++
	first := r.started == 1
	r.mu.Unlock()
	if first {
		close(r.done)
		<-r.release
	}
	return &models.BotMessage{ID: 1}, nil
}

func (r *blockingReplier) startedCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.started
}

func TestAFollowUpDoesNotRaceTheReplyItFollows(t *testing.T) {
	replier := &blockingReplier{release: make(chan struct{}), done: make(chan struct{})}
	scheduler, timers := manualScheduler(replier)

	scheduler.Schedule(7, 42, time.Second, nil)
	go (*timers)[0].run()
	<-replier.done // the first reply is now in flight and parked

	// The follow-up arrives while she is still writing.
	scheduler.Schedule(7, 42, time.Second, nil)
	require.True(t, scheduler.Pending(42))
	before := len(*timers)
	(*timers)[before-1].run()

	require.Equal(t, 1, replier.startedCount(),
		"a second generation must not start while the first is still running")
	require.True(t, scheduler.Pending(42), "the follow-up stays pending rather than being dropped")
	require.Greater(t, len(*timers), before, "and it rearms rather than waiting forever")

	close(replier.release)
}

func TestASchedulerWithNoGeneratorRefusesRatherThanArming(t *testing.T) {
	scheduler, timers := manualScheduler(nil)
	scheduler.Schedule(7, 42, time.Second, nil)
	require.Empty(t, *timers)
	require.False(t, scheduler.Pending(42))
}

type panickingReplier struct{}

func (panickingReplier) GenerateReply(context.Context, int, int) (*models.BotMessage, error) {
	panic("nil somewhere deep in generation")
}

func TestAPanickingReplyDoesNotTakeTheProcessDown(t *testing.T) {
	scheduler, timers := manualScheduler(panickingReplier{})
	scheduler.Schedule(7, 42, time.Second, nil)

	require.NotPanics(t, func() { (*timers)[0].run() },
		"a detached reply has no gin recovery behind it")
	require.False(t, scheduler.Pending(42))

	// And the conversation is not left marked busy, which would stall every
	// later reply to it behind a generation that already died.
	scheduler.mu.Lock()
	_, busy := scheduler.generating[42]
	scheduler.mu.Unlock()
	require.False(t, busy)
}

func TestEverySchedulingIsSettledExactlyOnce(t *testing.T) {
	replier := &recordingReplier{}
	scheduler, timers := manualScheduler(replier)

	var mu sync.Mutex
	outcomes := []bool{}
	record := func(delivered bool) {
		mu.Lock()
		defer mu.Unlock()
		outcomes = append(outcomes, delivered)
	}

	// A burst: two superseded, one answered. The two that never happened must
	// hand back what they were holding, or a coalesced burst quietly charges
	// for messages it never spent.
	scheduler.Schedule(7, 42, time.Second, record)
	scheduler.Schedule(7, 42, time.Second, record)
	scheduler.Schedule(7, 42, time.Second, record)

	mu.Lock()
	require.Equal(t, []bool{false, false}, outcomes, "superseded replies settle immediately")
	mu.Unlock()

	for _, timer := range *timers {
		timer.run()
	}
	mu.Lock()
	require.Equal(t, []bool{false, false, true}, outcomes, "and the survivor settles as delivered")
	mu.Unlock()
}

func TestACancelledOrClosedReplyIsSettledAsUndelivered(t *testing.T) {
	replier := &recordingReplier{}
	scheduler, _ := manualScheduler(replier)

	var mu sync.Mutex
	outcomes := []bool{}
	record := func(delivered bool) {
		mu.Lock()
		defer mu.Unlock()
		outcomes = append(outcomes, delivered)
	}

	scheduler.Schedule(7, 42, time.Second, record)
	scheduler.Cancel(42)
	scheduler.Schedule(8, 43, time.Second, record)
	scheduler.Close()
	// Refused after close, and refusal is still an outcome the caller must hear.
	scheduler.Schedule(9, 44, time.Second, record)

	mu.Lock()
	defer mu.Unlock()
	require.Equal(t, []bool{false, false, false}, outcomes)
}

func TestAFailedReplyIsNotSettledAsDelivered(t *testing.T) {
	replier := &recordingReplier{err: errors.New("provider unavailable")}
	scheduler, timers := manualScheduler(replier)

	settled := make(chan bool, 1)
	scheduler.Schedule(7, 42, time.Second, func(delivered bool) { settled <- delivered })
	(*timers)[0].run()

	require.False(t, <-settled, "a reply that never arrived must not be charged for")
}

func TestTheSettleWindowIsLongEnoughToBeWorthHavingAndShortEnoughToUse(t *testing.T) {
	// Zero would mean the first message of a burst is answered before the
	// second one is read, which is the whole thing this window exists to stop:
	// scheduling only folds messages together while an earlier reply is still
	// pending.
	require.Greater(t, OmniChatSettleWindow, time.Duration(0))

	// And this is what one message costs, every time. Past a few seconds a
	// person who sent one thing is left watching nothing happen.
	require.LessOrEqual(t, OmniChatSettleWindow, 5*time.Second)

	// It has to outlast the retry that bridges a generation already running, or
	// a follow-up would jump the queue it is supposed to wait in.
	require.Greater(t, OmniChatSettleWindow, omniChatReplyBusyRetry)
}

func TestScheduleRefusesIdentifiersItCouldNotAnswer(t *testing.T) {
	replier := &recordingReplier{}
	scheduler, timers := manualScheduler(replier)

	scheduler.Schedule(0, 42, time.Second, nil)
	scheduler.Schedule(7, 0, time.Second, nil)

	require.Empty(t, *timers)
	require.False(t, scheduler.Pending(42))
}

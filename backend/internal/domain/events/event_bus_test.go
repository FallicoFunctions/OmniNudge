package events

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEventBus_PublishSubscribe(t *testing.T) {
	bus := NewEventBus(true)

	var received Event
	var wg sync.WaitGroup
	wg.Add(1)

	bus.Subscribe("UserRegistered", func(event Event) {
		received = event
		wg.Done()
	})

	event := UserRegistered{
		UserID:       1,
		Username:     "testuser",
		Email:        "test@example.com",
		RegisteredAt: time.Now(),
	}
	bus.Publish(event)

	wg.Wait()

	require.NotNil(t, received)
	assert.Equal(t, "UserRegistered", received.EventName())
}

func TestEventBus_MultipleHandlers(t *testing.T) {
	bus := NewEventBus(false)

	var count int
	var mu sync.Mutex
	var wg sync.WaitGroup
	wg.Add(3)

	for i := 0; i < 3; i++ {
		bus.Subscribe("UserRegistered", func(event Event) {
			mu.Lock()
			count++
			mu.Unlock()
			wg.Done()
		})
	}

	bus.Publish(UserRegistered{UserID: 1, RegisteredAt: time.Now()})

	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	assert.Equal(t, 3, count)
}

func TestEventBus_NoHandlers(t *testing.T) {
	bus := NewEventBus(true)

	// Publishing to an event with no subscribers must not panic.
	assert.NotPanics(t, func() {
		bus.Publish(UserRegistered{UserID: 1, RegisteredAt: time.Now()})
	})
}

func TestEventBus_EventLog(t *testing.T) {
	bus := NewEventBus(true)

	bus.Publish(UserRegistered{UserID: 1, RegisteredAt: time.Now()})
	bus.Publish(UserRegistered{UserID: 2, RegisteredAt: time.Now()})

	// Event log is written synchronously inside Publish (before handlers run),
	// so no sleep is needed here.
	log := bus.GetEventLog()
	assert.Len(t, log, 2)

	bus.Clear()
	assert.Len(t, bus.GetEventLog(), 0)
}

func TestEventBus_HandlerPanic(t *testing.T) {
	bus := NewEventBus(false)

	var wg sync.WaitGroup
	wg.Add(2)

	// Panicking handler.
	bus.Subscribe("UserRegistered", func(event Event) {
		defer wg.Done()
		panic("deliberate test panic")
	})

	// Normal handler — must still run even if the other handler panics.
	bus.Subscribe("UserRegistered", func(event Event) {
		defer wg.Done()
	})

	bus.Publish(UserRegistered{UserID: 1, RegisteredAt: time.Now()})

	wg.Wait() // passes only if both goroutines complete (panic was recovered)
}

func TestEventBus_ConcurrentPublish(t *testing.T) {
	bus := NewEventBus(true)

	const eventCount = 100
	var wg sync.WaitGroup

	for i := 0; i < eventCount; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			bus.Publish(UserRegistered{UserID: id, RegisteredAt: time.Now()})
		}(i)
	}

	wg.Wait()
	// Event log is written synchronously; all entries are guaranteed after wg.Wait().
	log := bus.GetEventLog()
	assert.Greater(t, len(log), 0, "bus was created with logEvents=true so log must not be empty")
	assert.Len(t, log, eventCount)
}

func TestEventBus_ConcurrentSubscribePublish(t *testing.T) {
	bus := NewEventBus(false)

	var wg sync.WaitGroup

	// Subscribe concurrently.
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			bus.Subscribe("UserRegistered", func(event Event) {})
		}()
	}

	// Publish concurrently.
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			bus.Publish(UserRegistered{UserID: id, RegisteredAt: time.Now()})
		}(i)
	}

	wg.Wait()
	// If we get here without a race, the mutex strategy is correct.
}

func TestEventBus_ClearHandlers(t *testing.T) {
	bus := NewEventBus(true)

	var called bool
	var mu sync.Mutex
	var wg sync.WaitGroup
	wg.Add(1)

	bus.Subscribe("UserRegistered", func(event Event) {
		mu.Lock()
		called = true
		mu.Unlock()
		wg.Done()
	})

	// Confirm the handler fires before clearing.
	bus.Publish(UserRegistered{UserID: 1, RegisteredAt: time.Now()})
	wg.Wait()
	mu.Lock()
	assert.True(t, called, "handler must fire before ClearHandlers")
	called = false
	mu.Unlock()

	// After clearing handlers, a publish must not trigger any handler.
	bus.ClearHandlers()
	bus.Clear()
	bus.Publish(UserRegistered{UserID: 2, RegisteredAt: time.Now()})

	// ClearHandlers removes all subscriptions, so Publish spawns no goroutines.
	// The event log append is synchronous, so there is no race: by the time
	// Publish returns, the log has been written and no handler goroutine exists.
	mu.Lock()
	assert.False(t, called, "handler must not fire after ClearHandlers")
	mu.Unlock()

	// Only the second publish is logged (first was cleared by bus.Clear()).
	assert.Len(t, bus.GetEventLog(), 1)
}

func TestEventBus_DifferentEventTypes(t *testing.T) {
	bus := NewEventBus(true)

	var wg sync.WaitGroup
	wg.Add(2)

	received := make([]string, 0, 2)
	var mu sync.Mutex

	bus.Subscribe("UserRegistered", func(event Event) {
		mu.Lock()
		received = append(received, event.EventName())
		mu.Unlock()
		wg.Done()
	})
	bus.Subscribe("UserBanned", func(event Event) {
		mu.Lock()
		received = append(received, event.EventName())
		mu.Unlock()
		wg.Done()
	})

	bus.Publish(UserRegistered{UserID: 1, RegisteredAt: time.Now()})
	bus.Publish(UserBanned{UserID: 2, BannedAt: time.Now()})

	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	assert.Contains(t, received, "UserRegistered")
	assert.Contains(t, received, "UserBanned")
}

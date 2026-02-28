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

	// Give goroutines time to settle (event log is written synchronously, so no
	// sleep is strictly needed, but handlers run async).
	time.Sleep(10 * time.Millisecond)

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
	time.Sleep(20 * time.Millisecond) // let any in-flight goroutine handler settle

	log := bus.GetEventLog()
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

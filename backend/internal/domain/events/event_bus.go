package events

import (
	"log"
	"sync"
	"time"
)

// Event is the interface all domain events must implement.
type Event interface {
	// EventName returns the event type identifier.
	EventName() string

	// OccurredAt returns when the event happened.
	OccurredAt() time.Time
}

// Handler is a function that processes a domain event.
type Handler func(event Event)

// EventBus manages publish/subscribe for domain events.
// It is safe for concurrent use. Handlers are invoked asynchronously in
// separate goroutines; panics inside handlers are recovered and logged so
// that a misbehaving handler cannot crash the bus.
type EventBus struct {
	mu        sync.RWMutex
	handlers  map[string][]Handler
	eventLog  []Event // populated only when logEvents==true
	logEvents bool
}

// NewEventBus creates a new EventBus.
// Set logEvents=true in tests and staging so that published events can be
// inspected via GetEventLog. In production set it to false to avoid the
// overhead of growing an unbounded slice.
func NewEventBus(logEvents bool) *EventBus {
	return &EventBus{
		handlers:  make(map[string][]Handler),
		eventLog:  make([]Event, 0),
		logEvents: logEvents,
	}
}

// Subscribe registers handler for all events of the given name.
// Multiple handlers may be registered for the same name; all are called.
func (eb *EventBus) Subscribe(eventName string, handler Handler) {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	eb.handlers[eventName] = append(eb.handlers[eventName], handler)
}

// Publish dispatches event to every registered handler ASYNCHRONOUSLY in
// separate goroutines. Important guarantees:
//   - Event ordering is NOT guaranteed; goroutines may complete in any order.
//   - Handlers MUST be idempotent and safe for concurrent use.
//   - Handlers MUST NOT assume other handlers have completed.
//   - Panics inside handlers are recovered and logged by the bus.
//
// When logEvents is true, the event is appended to the internal log
// synchronously (before handlers are launched) so GetEventLog is safe to
// call immediately after Publish in tests.
func (eb *EventBus) Publish(event Event) {
	if eb.logEvents {
		eb.mu.Lock()
		eb.eventLog = append(eb.eventLog, event)
		eb.mu.Unlock()
	}

	eb.mu.RLock()
	handlers := make([]Handler, len(eb.handlers[event.EventName()]))
	copy(handlers, eb.handlers[event.EventName()])
	eb.mu.RUnlock()

	for _, h := range handlers {
		go func(handler Handler) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[EventBus] handler panic for %q: %v", event.EventName(), r)
				}
			}()
			handler(event)
		}(h)
	}
}

// GetEventLog returns a snapshot of all logged events (for testing).
// Only meaningful when the bus was created with logEvents=true.
func (eb *EventBus) GetEventLog() []Event {
	eb.mu.RLock()
	defer eb.mu.RUnlock()

	snapshot := make([]Event, len(eb.eventLog))
	copy(snapshot, eb.eventLog)
	return snapshot
}

// Clear empties the event log (for testing). Does NOT remove registered handlers.
func (eb *EventBus) Clear() {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	eb.eventLog = eb.eventLog[:0]
}

// ClearHandlers removes all registered handlers (for test isolation).
// Does NOT clear the event log; call Clear() for that.
func (eb *EventBus) ClearHandlers() {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	eb.handlers = make(map[string][]Handler)
}

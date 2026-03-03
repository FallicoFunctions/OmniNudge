package eventhandlers

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/omninudge/backend/internal/domain/events"
)

// TestOnUserRegistered_CorrectEventType verifies the handler processes the
// expected event type without panicking.
func TestOnUserRegistered_CorrectEventType(t *testing.T) {
	h := NewUserEventHandlers()
	assert.NotPanics(t, func() {
		h.OnUserRegistered(events.UserRegistered{
			UserID:       1,
			Username:     "testuser",
			Email:        "test@example.com",
			RegisteredAt: time.Now(),
		})
	})
}

// TestOnUserRegistered_WrongEventType verifies the handler does not panic when
// given the wrong event type (defensive type assertion path).
func TestOnUserRegistered_WrongEventType(t *testing.T) {
	h := NewUserEventHandlers()
	assert.NotPanics(t, func() {
		h.OnUserRegistered(events.UserBanned{UserID: 1, BannedAt: time.Now()})
	})
}

func TestOnUserBanned_CorrectEventType(t *testing.T) {
	h := NewUserEventHandlers()
	assert.NotPanics(t, func() {
		h.OnUserBanned(events.UserBanned{
			UserID:       1,
			Username:     "testuser",
			Reason:       "spam",
			ReasonPublic: true,
			BannedBy:     99,
			BannedAt:     time.Now(),
		})
	})
}

func TestOnUserBanned_WrongEventType(t *testing.T) {
	h := NewUserEventHandlers()
	assert.NotPanics(t, func() {
		h.OnUserBanned(events.UserRegistered{UserID: 1, RegisteredAt: time.Now()})
	})
}

func TestOnUserUnbanned_CorrectEventType(t *testing.T) {
	h := NewUserEventHandlers()
	assert.NotPanics(t, func() {
		h.OnUserUnbanned(events.UserUnbanned{
			UserID:     1,
			Username:   "testuser",
			Reason:     "appeal approved",
			UnbannedBy: 99,
			UnbannedAt: time.Now(),
		})
	})
}

func TestOnUserUnbanned_WrongEventType(t *testing.T) {
	h := NewUserEventHandlers()
	assert.NotPanics(t, func() {
		h.OnUserUnbanned(events.UserRegistered{UserID: 1, RegisteredAt: time.Now()})
	})
}

func TestOnUserDeleted_CorrectEventType(t *testing.T) {
	h := NewUserEventHandlers()
	assert.NotPanics(t, func() {
		h.OnUserDeleted(events.UserDeleted{
			UserID:    1,
			Username:  "testuser",
			Reason:    "violation",
			DeletedBy: 99,
			DeletedAt: time.Now(),
		})
	})
}

func TestOnUserDeleted_WrongEventType(t *testing.T) {
	h := NewUserEventHandlers()
	assert.NotPanics(t, func() {
		h.OnUserDeleted(events.UserRegistered{UserID: 1, RegisteredAt: time.Now()})
	})
}

func TestOnPasswordChanged_CorrectEventType(t *testing.T) {
	h := NewUserEventHandlers()
	assert.NotPanics(t, func() {
		h.OnPasswordChanged(events.PasswordChanged{UserID: 1, ChangedAt: time.Now()})
	})
}

func TestOnPasswordChanged_WrongEventType(t *testing.T) {
	h := NewUserEventHandlers()
	assert.NotPanics(t, func() {
		h.OnPasswordChanged(events.UserRegistered{UserID: 1, RegisteredAt: time.Now()})
	})
}

// TestHandlers_ViaEventBus verifies that all handlers integrate correctly with
// the EventBus — they receive events, don't panic, and don't block the bus.
func TestHandlers_ViaEventBus(t *testing.T) {
	bus := events.NewEventBus(true)
	h := NewUserEventHandlers()

	bus.Subscribe("UserRegistered", h.OnUserRegistered)
	bus.Subscribe("UserBanned", h.OnUserBanned)
	bus.Subscribe("UserUnbanned", h.OnUserUnbanned)
	bus.Subscribe("UserDeleted", h.OnUserDeleted)
	bus.Subscribe("PasswordChanged", h.OnPasswordChanged)

	assert.NotPanics(t, func() {
		bus.Publish(events.UserRegistered{UserID: 1, Username: "u", Email: "u@e.com", RegisteredAt: time.Now()})
		bus.Publish(events.UserBanned{UserID: 1, BannedAt: time.Now()})
		bus.Publish(events.UserUnbanned{UserID: 1, UnbannedAt: time.Now()})
		bus.Publish(events.UserDeleted{UserID: 1, DeletedAt: time.Now()})
		bus.Publish(events.PasswordChanged{UserID: 1, ChangedAt: time.Now()})
	})

	// Event log is written synchronously.
	assert.Len(t, bus.GetEventLog(), 5)
}

// Package eventhandlers wires domain events to application-level side effects
// such as sending emails, push notifications, and writing to audit logs.
//
// Each handler is registered with the EventBus in cmd/server/main.go. Handlers
// are invoked asynchronously by the bus, so they must be safe for concurrent
// use and must not panic (the bus recovers panics, but it is still bad practice).
package eventhandlers

import (
	"log"

	"github.com/omninudge/backend/internal/domain/events"
)

// UserEventHandlers groups handlers for user-related domain events.
// Future dependencies (email service, notification service, etc.) will be
// injected through this struct.
type UserEventHandlers struct {
	// emailService *services.EmailService  (wired when email service is ready)
}

// NewUserEventHandlers creates a ready-to-register set of user event handlers.
func NewUserEventHandlers() *UserEventHandlers {
	return &UserEventHandlers{}
}

// OnUserRegistered handles UserRegistered events.
// Side effects: send welcome email, initialise default settings.
func (h *UserEventHandlers) OnUserRegistered(event events.Event) {
	e, ok := event.(events.UserRegistered)
	if !ok {
		log.Printf("[eventhandlers] OnUserRegistered: unexpected event type %T", event)
		return
	}

	log.Printf("[eventhandlers] User registered: id=%d username=%s", e.UserID, e.Username)

	// TODO: h.emailService.SendWelcomeEmail(e.Email, e.Username)
	// TODO: initialise default user settings
	// TODO: record first-seen analytics event
}

// OnUserBanned handles UserBanned events.
// Side effects: revoke sessions, notify user, write to audit log.
func (h *UserEventHandlers) OnUserBanned(event events.Event) {
	e, ok := event.(events.UserBanned)
	if !ok {
		log.Printf("[eventhandlers] OnUserBanned: unexpected event type %T", event)
		return
	}

	log.Printf("[eventhandlers] User banned: id=%d username=%s reason=%s", e.UserID, e.Username, e.Reason)

	// TODO: revoke all active sessions for e.UserID
	// TODO: send ban-notification email if reason is public
	// TODO: write to audit log
}

// OnUserUnbanned handles UserUnbanned events.
// Side effects: send unban notification email.
func (h *UserEventHandlers) OnUserUnbanned(event events.Event) {
	e, ok := event.(events.UserUnbanned)
	if !ok {
		log.Printf("[eventhandlers] OnUserUnbanned: unexpected event type %T", event)
		return
	}

	log.Printf("[eventhandlers] User unbanned: id=%d username=%s", e.UserID, e.Username)

	// TODO: send unban-notification email
}

// OnPasswordChanged handles PasswordChanged events.
// Side effects: revoke other sessions, send security notification email.
func (h *UserEventHandlers) OnPasswordChanged(event events.Event) {
	e, ok := event.(events.PasswordChanged)
	if !ok {
		log.Printf("[eventhandlers] OnPasswordChanged: unexpected event type %T", event)
		return
	}

	log.Printf("[eventhandlers] Password changed: user_id=%d", e.UserID)

	// TODO: revoke all sessions except the current one
	// TODO: h.emailService.SendPasswordChangedNotification(e.UserID)
}

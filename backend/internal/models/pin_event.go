package models

import "time"

// PinEvent is the typed WebSocket payload used for message pin/unpin events.
//
// It carries no preview. One was built from the stored content -- ciphertext
// for an encrypted message, cut to 120 characters -- which no reader can open;
// the app shows the message it already holds and decrypts it itself.
type PinEvent struct {
	Type           string     `json:"type"`
	MessageID      int        `json:"message_id"`
	ConversationID int        `json:"conversation_id"`
	PinnedBy       *int       `json:"pinned_by,omitempty"`
	PinnedAt       *time.Time `json:"pinned_at,omitempty"`
	MessageType    string     `json:"message_type"`
}

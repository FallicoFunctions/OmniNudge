package models

import "time"

// PinEvent is the typed WebSocket payload used for message pin/unpin events.
type PinEvent struct {
	Type           string     `json:"type"`
	MessageID      int        `json:"message_id"`
	ConversationID int        `json:"conversation_id"`
	PinnedBy       *int       `json:"pinned_by,omitempty"`
	PinnedAt       *time.Time `json:"pinned_at,omitempty"`
	Preview        string     `json:"preview"`
	MessageType    string     `json:"message_type"`
}

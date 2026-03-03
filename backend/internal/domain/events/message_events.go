package events

import "time"

// MessageSent is published when a message is sent in a conversation.
type MessageSent struct {
	MessageID      int
	ConversationID int
	SenderID       int
	RecipientID    int
	SentAt         time.Time
}

func (e MessageSent) EventName() string  { return "MessageSent" }
func (e MessageSent) OccurredAt() time.Time { return e.SentAt }

// MessageDeleted is published when a message is deleted.
type MessageDeleted struct {
	MessageID      int
	ConversationID int
	DeletedBy      int
	DeletedAt      time.Time
}

func (e MessageDeleted) EventName() string  { return "MessageDeleted" }
func (e MessageDeleted) OccurredAt() time.Time { return e.DeletedAt }

// ConversationCreated is published when a new conversation is created.
type ConversationCreated struct {
	ConversationID int
	User1ID        int
	User2ID        int
	CreatedAt      time.Time
}

func (e ConversationCreated) EventName() string  { return "ConversationCreated" }
func (e ConversationCreated) OccurredAt() time.Time { return e.CreatedAt }

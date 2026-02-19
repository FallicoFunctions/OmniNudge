package models

// ThreadUpdateEvent is emitted when a new reply is added to a thread.
type ThreadUpdateEvent struct {
	Type           string   `json:"type"`
	ConversationID int      `json:"conversation_id"`
	ThreadRoot     int      `json:"thread_root"`
	ReplyID        int      `json:"reply_id"`
	ReplyCount     int      `json:"reply_count"`
	Message        *Message `json:"message"`
}

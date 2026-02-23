package models

import "time"

// Call represents a voice or video call between two users.
type Call struct {
	ID              int        `json:"id"`
	ConversationID  int        `json:"conversation_id"`
	CallerID        int        `json:"caller_id"`
	CalleeID        int        `json:"callee_id"`
	CallType        string     `json:"call_type"`
	Status          string     `json:"status"`
	StartedAt       time.Time  `json:"started_at"`
	AnsweredAt      *time.Time `json:"answered_at,omitempty"`
	EndedAt         *time.Time `json:"ended_at,omitempty"`
	DurationSeconds *int       `json:"duration_seconds,omitempty"`
	EndedBy         *int       `json:"ended_by,omitempty"`

	// Screen sharing fields (F14).
	IsScreenSharing      bool       `json:"is_screen_sharing"`
	ScreenShareStartedAt *time.Time `json:"screen_share_started_at,omitempty"`
	ScreenShareEndedAt   *time.Time `json:"screen_share_ended_at,omitempty"`

	// Joined fields for API responses.
	CallerUsername *string `json:"caller_username,omitempty"`
	CalleeUsername *string `json:"callee_username,omitempty"`
}

// CallParticipant tracks a user's participation in a call.
type CallParticipant struct {
	ID                int        `json:"id"`
	CallID            int        `json:"call_id"`
	UserID            int        `json:"user_id"`
	JoinedAt          time.Time  `json:"joined_at"`
	LeftAt            *time.Time `json:"left_at,omitempty"`
	ConnectionQuality *string    `json:"connection_quality,omitempty"`
}

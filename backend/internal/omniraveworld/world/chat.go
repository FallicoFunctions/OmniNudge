package world

import "time"

// SystemChatName is the playerName carried by server-originated announcements
// (sec 5.1.1's Main Stage 5-minute/1-minute fireworks warnings). It mirrors
// the frontend's SYSTEM_CHAT_NAME constant (createChatPanel.ts) so a
// PlayerID-less ChatMessage renders as `System HH:MM:SSPM: <body>` exactly
// per spec, using the client's existing normal-message rendering path.
const SystemChatName = "System"

type ChatMessage struct {
	PlayerID   string    `json:"playerId"`
	PlayerName string    `json:"playerName"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"createdAt"`
}

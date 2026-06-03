package world

import "time"

type ChatMessage struct {
	PlayerID   string    `json:"playerId"`
	PlayerName string    `json:"playerName"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"createdAt"`
}

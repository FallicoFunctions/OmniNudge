package models

import "time"

// PlatformPostCursor represents a cursor for platform post pagination.
type PlatformPostCursor struct {
	ID                 int       `json:"id"`
	CreatedAt          time.Time `json:"created_at"`
	Score              int       `json:"score"`
	HotScore           float64   `json:"hot_score"`
	RisingScore        float64   `json:"rising_score"`
	ControversialScore float64   `json:"controversial_score"`
}

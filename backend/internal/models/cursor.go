package models

import "time"

// TimeCursor is a generic cursor payload for time-ordered lists.
type TimeCursor struct {
	ID        int
	Timestamp time.Time
}

// ThemePublicCursor supports public theme ordering.
type ThemePublicCursor struct {
	ID            int
	InstallCount  int
	AverageRating float64
	CreatedAt     time.Time
}

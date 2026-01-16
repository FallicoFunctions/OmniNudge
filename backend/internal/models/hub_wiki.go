package models

import "time"

// HubWikiPage represents a wiki page for a hub.
type HubWikiPage struct {
	ID        int        `json:"id"`
	HubID     int        `json:"hub_id"`
	Slug      string     `json:"slug"`
	Content   string     `json:"content"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	UpdatedBy *int       `json:"updated_by,omitempty"`
	Exists    bool       `json:"exists"`
}

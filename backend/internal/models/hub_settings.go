package models

import (
	"time"

	"github.com/lib/pq"
)

// HubSettings represents configuration for a hub
type HubSettings struct {
	ID     int `json:"id"`
	HubID  int `json:"hub_id"`

	// Basic info
	DisplayTitle    *string `json:"display_title,omitempty"`
	SidebarMarkdown *string `json:"sidebar_markdown,omitempty"`

	// Privacy settings
	PrivacyType string `json:"privacy_type"` // public, restricted, private

	// Content settings
	AllowTextPosts  bool `json:"allow_text_posts"`
	AllowLinkPosts  bool `json:"allow_link_posts"`
	AllowImagePosts bool `json:"allow_image_posts"`
	AllowVideoPosts bool `json:"allow_video_posts"`
	AllowPollPosts  bool `json:"allow_poll_posts"`

	// Media settings
	AllowMediaInComments bool `json:"allow_media_in_comments"`
	RequirePostFlair     bool `json:"require_post_flair"`

	// Auto-moderation
	BannedWords          pq.StringArray `json:"banned_words"`
	SpamFilterStrength   string         `json:"spam_filter_strength"` // low, medium, high
	NewAccountFilterDays int            `json:"new_account_filter_days"`
	MinAccountKarma      int            `json:"min_account_karma"`

	// Other settings
	AllowSpoilers   bool `json:"allow_spoilers"`
	ShowThumbnails  bool `json:"show_thumbnails"`
	EnableWiki      bool `json:"enable_wiki"`

	// Timestamps
	UpdatedAt *time.Time `json:"updated_at,omitempty"`
	UpdatedBy *int       `json:"updated_by,omitempty"`
}

// HubTheme represents a custom CSS theme for a hub
type HubTheme struct {
	ID    int `json:"id"`
	HubID int `json:"hub_id"`

	// Theme metadata
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	IsActive    bool    `json:"is_active"`

	// CSS content
	CSSContent *string `json:"css_content,omitempty"`

	// Application scope
	ApplyToWholePage  bool `json:"apply_to_whole_page"`
	ApplyToHeader     bool `json:"apply_to_header"`
	ApplyToSidebar    bool `json:"apply_to_sidebar"`
	ApplyToPostList   bool `json:"apply_to_post_list"`
	ApplyToPostDetail bool `json:"apply_to_post_detail"`

	// Version control
	Version         int  `json:"version"`
	ParentVersionID *int `json:"parent_version_id,omitempty"`

	// Timestamps
	CreatedAt time.Time  `json:"created_at"`
	CreatedBy int        `json:"created_by"`
	UpdatedAt *time.Time `json:"updated_at,omitempty"`
}

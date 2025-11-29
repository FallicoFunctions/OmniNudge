package models

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SlideshowSession represents an active slideshow session in a conversation
type SlideshowSession struct {
	ID                  int       `json:"id"`
	ConversationID      int       `json:"conversation_id"`
	SlideshowType       string    `json:"slideshow_type"` // 'personal' or 'reddit'
	Subreddit           *string   `json:"subreddit,omitempty"`
	RedditSort          *string   `json:"reddit_sort,omitempty"`
	CurrentIndex        int       `json:"current_index"`
	TotalItems          int       `json:"total_items"`
	ControllerUserID    int       `json:"controller_user_id"`
	AutoAdvance         bool      `json:"auto_advance"`
	AutoAdvanceInterval int       `json:"auto_advance_interval"` // seconds
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

// SlideshowMediaItem represents a media item in a personal slideshow
type SlideshowMediaItem struct {
	ID                 int       `json:"id"`
	SlideshowSessionID int       `json:"slideshow_session_id"`
	MediaFileID        int       `json:"media_file_id"`
	Position           int       `json:"position"`
	Caption            *string   `json:"caption,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
}

// SlideshowRepository handles database operations for slideshows
type SlideshowRepository struct {
	pool *pgxpool.Pool
}

// NewSlideshowRepository creates a new slideshow repository
func NewSlideshowRepository(pool *pgxpool.Pool) *SlideshowRepository {
	return &SlideshowRepository{pool: pool}
}

// CreateSession creates a new slideshow session
func (r *SlideshowRepository) CreateSession(ctx context.Context, session *SlideshowSession) error {
	query := `
		INSERT INTO slideshow_sessions (
			conversation_id, slideshow_type, subreddit, reddit_sort,
			current_index, total_items, controller_user_id,
			auto_advance, auto_advance_interval
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at, updated_at
	`

	err := r.pool.QueryRow(
		ctx, query,
		session.ConversationID,
		session.SlideshowType,
		session.Subreddit,
		session.RedditSort,
		session.CurrentIndex,
		session.TotalItems,
		session.ControllerUserID,
		session.AutoAdvance,
		session.AutoAdvanceInterval,
	).Scan(&session.ID, &session.CreatedAt, &session.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to create slideshow session: %w", err)
	}

	return nil
}

// GetByConversationID retrieves the active slideshow session for a conversation
func (r *SlideshowRepository) GetByConversationID(ctx context.Context, conversationID int) (*SlideshowSession, error) {
	query := `
		SELECT id, conversation_id, slideshow_type, subreddit, reddit_sort,
		       current_index, total_items, controller_user_id,
		       auto_advance, auto_advance_interval, created_at, updated_at
		FROM slideshow_sessions
		WHERE conversation_id = $1
	`

	session := &SlideshowSession{}
	err := r.pool.QueryRow(ctx, query, conversationID).Scan(
		&session.ID,
		&session.ConversationID,
		&session.SlideshowType,
		&session.Subreddit,
		&session.RedditSort,
		&session.CurrentIndex,
		&session.TotalItems,
		&session.ControllerUserID,
		&session.AutoAdvance,
		&session.AutoAdvanceInterval,
		&session.CreatedAt,
		&session.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get slideshow session: %w", err)
	}

	return session, nil
}

// GetByID retrieves a slideshow session by ID
func (r *SlideshowRepository) GetByID(ctx context.Context, id int) (*SlideshowSession, error) {
	query := `
		SELECT id, conversation_id, slideshow_type, subreddit, reddit_sort,
		       current_index, total_items, controller_user_id,
		       auto_advance, auto_advance_interval, created_at, updated_at
		FROM slideshow_sessions
		WHERE id = $1
	`

	session := &SlideshowSession{}
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&session.ID,
		&session.ConversationID,
		&session.SlideshowType,
		&session.Subreddit,
		&session.RedditSort,
		&session.CurrentIndex,
		&session.TotalItems,
		&session.ControllerUserID,
		&session.AutoAdvance,
		&session.AutoAdvanceInterval,
		&session.CreatedAt,
		&session.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get slideshow session: %w", err)
	}

	return session, nil
}

// UpdateCurrentIndex updates the current slide index
func (r *SlideshowRepository) UpdateCurrentIndex(ctx context.Context, sessionID int, index int) error {
	query := `
		UPDATE slideshow_sessions
		SET current_index = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`

	_, err := r.pool.Exec(ctx, query, index, sessionID)
	if err != nil {
		return fmt.Errorf("failed to update current index: %w", err)
	}

	return nil
}

// UpdateController transfers control to a different user
func (r *SlideshowRepository) UpdateController(ctx context.Context, sessionID int, newControllerID int) error {
	query := `
		UPDATE slideshow_sessions
		SET controller_user_id = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`

	_, err := r.pool.Exec(ctx, query, newControllerID, sessionID)
	if err != nil {
		return fmt.Errorf("failed to update controller: %w", err)
	}

	return nil
}

// UpdateAutoAdvance updates auto-advance settings
func (r *SlideshowRepository) UpdateAutoAdvance(ctx context.Context, sessionID int, autoAdvance bool, interval int) error {
	query := `
		UPDATE slideshow_sessions
		SET auto_advance = $1, auto_advance_interval = $2, updated_at = CURRENT_TIMESTAMP
		WHERE id = $3
	`

	_, err := r.pool.Exec(ctx, query, autoAdvance, interval, sessionID)
	if err != nil {
		return fmt.Errorf("failed to update auto-advance: %w", err)
	}

	return nil
}

// Delete removes a slideshow session
func (r *SlideshowRepository) Delete(ctx context.Context, sessionID int) error {
	query := `DELETE FROM slideshow_sessions WHERE id = $1`

	_, err := r.pool.Exec(ctx, query, sessionID)
	if err != nil {
		return fmt.Errorf("failed to delete slideshow session: %w", err)
	}

	return nil
}

// AddMediaItem adds a media item to a personal slideshow
func (r *SlideshowRepository) AddMediaItem(ctx context.Context, item *SlideshowMediaItem) error {
	query := `
		INSERT INTO slideshow_media_items (
			slideshow_session_id, media_file_id, position, caption
		) VALUES ($1, $2, $3, $4)
		RETURNING id, created_at
	`

	err := r.pool.QueryRow(
		ctx, query,
		item.SlideshowSessionID,
		item.MediaFileID,
		item.Position,
		item.Caption,
	).Scan(&item.ID, &item.CreatedAt)

	if err != nil {
		return fmt.Errorf("failed to add media item: %w", err)
	}

	return nil
}

// GetMediaItems retrieves all media items for a slideshow session
func (r *SlideshowRepository) GetMediaItems(ctx context.Context, sessionID int) ([]SlideshowMediaItem, error) {
	query := `
		SELECT id, slideshow_session_id, media_file_id, position, caption, created_at
		FROM slideshow_media_items
		WHERE slideshow_session_id = $1
		ORDER BY position ASC
	`

	rows, err := r.pool.Query(ctx, query, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get media items: %w", err)
	}
	defer rows.Close()

	var items []SlideshowMediaItem
	for rows.Next() {
		var item SlideshowMediaItem
		err := rows.Scan(
			&item.ID,
			&item.SlideshowSessionID,
			&item.MediaFileID,
			&item.Position,
			&item.Caption,
			&item.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan media item: %w", err)
		}
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating media items: %w", err)
	}

	return items, nil
}

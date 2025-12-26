package models

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RemovedContent struct {
	ID               int        `json:"id"`
	ContentType      string     `json:"content_type"` // 'post' or 'comment'
	ContentID        int        `json:"content_id"`
	HubID            *int       `json:"hub_id,omitempty"`
	RemovedBy        int        `json:"removed_by"`
	RemovalReasonID  *int       `json:"removal_reason_id,omitempty"`
	CustomReason     string     `json:"custom_reason,omitempty"`
	ModNote          string     `json:"mod_note,omitempty"` // Private note for mod team
	RemovedAt        time.Time  `json:"removed_at"`

	// Populated fields
	RemovedByName    string     `json:"removed_by_name,omitempty"`
	ReasonTitle      string     `json:"reason_title,omitempty"`
	ReasonMessage    string     `json:"reason_message,omitempty"`
}

type RemovedContentRepository struct {
	db *pgxpool.Pool
}

func NewRemovedContentRepository(db *pgxpool.Pool) *RemovedContentRepository {
	return &RemovedContentRepository{db: db}
}

// RemoveContent tracks content removal
func (r *RemovedContentRepository) RemoveContent(ctx context.Context, contentType string, contentID int, hubID *int, removedBy int, removalReasonID *int, customReason, modNote string) (*RemovedContent, error) {
	query := `
		INSERT INTO removed_content (content_type, content_id, hub_id, removed_by, removal_reason_id, custom_reason, mod_note)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (content_type, content_id) DO UPDATE
			SET removed_by = EXCLUDED.removed_by,
				removal_reason_id = EXCLUDED.removal_reason_id,
				custom_reason = EXCLUDED.custom_reason,
				mod_note = EXCLUDED.mod_note,
				removed_at = NOW()
		RETURNING id, content_type, content_id, hub_id, removed_by, removal_reason_id, custom_reason, mod_note, removed_at
	`

	var removed RemovedContent
	err := r.db.QueryRow(ctx, query, contentType, contentID, hubID, removedBy, removalReasonID, customReason, modNote).Scan(
		&removed.ID, &removed.ContentType, &removed.ContentID, &removed.HubID, &removed.RemovedBy,
		&removed.RemovalReasonID, &removed.CustomReason, &removed.ModNote, &removed.RemovedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to track removed content: %w", err)
	}

	return &removed, nil
}

// RestoreContent removes the removal tracking (approves the content)
func (r *RemovedContentRepository) RestoreContent(ctx context.Context, contentType string, contentID int) error {
	query := `DELETE FROM removed_content WHERE content_type = $1 AND content_id = $2`

	result, err := r.db.Exec(ctx, query, contentType, contentID)
	if err != nil {
		return fmt.Errorf("failed to restore content: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("no removed content found for %s %d", contentType, contentID)
	}

	return nil
}

// IsContentRemoved checks if specific content is removed
func (r *RemovedContentRepository) IsContentRemoved(ctx context.Context, contentType string, contentID int) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM removed_content WHERE content_type = $1 AND content_id = $2)`

	var removed bool
	err := r.db.QueryRow(ctx, query, contentType, contentID).Scan(&removed)
	if err != nil {
		return false, fmt.Errorf("failed to check removal status: %w", err)
	}

	return removed, nil
}

// GetByContent retrieves removal info for specific content
func (r *RemovedContentRepository) GetByContent(ctx context.Context, contentType string, contentID int) (*RemovedContent, error) {
	query := `
		SELECT rc.id, rc.content_type, rc.content_id, rc.hub_id, rc.removed_by,
			   rc.removal_reason_id, rc.custom_reason, rc.mod_note, rc.removed_at,
			   u.username as removed_by_name,
			   rr.title as reason_title, rr.message as reason_message
		FROM removed_content rc
		JOIN users u ON rc.removed_by = u.id
		LEFT JOIN removal_reasons rr ON rc.removal_reason_id = rr.id
		WHERE rc.content_type = $1 AND rc.content_id = $2
	`

	var removed RemovedContent
	err := r.db.QueryRow(ctx, query, contentType, contentID).Scan(
		&removed.ID, &removed.ContentType, &removed.ContentID, &removed.HubID, &removed.RemovedBy,
		&removed.RemovalReasonID, &removed.CustomReason, &removed.ModNote, &removed.RemovedAt,
		&removed.RemovedByName, &removed.ReasonTitle, &removed.ReasonMessage,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get removed content: %w", err)
	}

	return &removed, nil
}

// GetByHub lists all removed content for a hub
func (r *RemovedContentRepository) GetByHub(ctx context.Context, hubID int, limit, offset int) ([]*RemovedContent, error) {
	query := `
		SELECT rc.id, rc.content_type, rc.content_id, rc.hub_id, rc.removed_by,
			   rc.removal_reason_id, rc.custom_reason, rc.mod_note, rc.removed_at,
			   u.username as removed_by_name,
			   rr.title as reason_title, rr.message as reason_message
		FROM removed_content rc
		JOIN users u ON rc.removed_by = u.id
		LEFT JOIN removal_reasons rr ON rc.removal_reason_id = rr.id
		WHERE rc.hub_id = $1
		ORDER BY rc.removed_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.Query(ctx, query, hubID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get removed content: %w", err)
	}
	defer rows.Close()

	var removals []*RemovedContent
	for rows.Next() {
		var removed RemovedContent
		err := rows.Scan(
			&removed.ID, &removed.ContentType, &removed.ContentID, &removed.HubID, &removed.RemovedBy,
			&removed.RemovalReasonID, &removed.CustomReason, &removed.ModNote, &removed.RemovedAt,
			&removed.RemovedByName, &removed.ReasonTitle, &removed.ReasonMessage,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan removed content: %w", err)
		}
		removals = append(removals, &removed)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating removed content: %w", err)
	}

	return removals, nil
}

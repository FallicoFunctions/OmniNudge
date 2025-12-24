package models

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Hub represents a site-local community
type Hub struct {
	ID              int        `json:"id"`
	Name            string     `json:"name"`
	Description     *string    `json:"description,omitempty"`
	Title           *string    `json:"title,omitempty"`           // Display title for the hub
	Type            string     `json:"type"`                       // public or private
	ContentOptions  string     `json:"content_options"`            // any, links_only, or text_only
	IsQuarantined   bool       `json:"is_quarantined"`             // Whether hub is quarantined
	SubscriberCount int        `json:"subscriber_count"`           // Number of subscribers
	CreatedBy       *int       `json:"created_by,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	NSFW            bool       `json:"nsfw"`
}

// HubRepository manages hubs
type HubRepository struct {
	pool *pgxpool.Pool
}

// NewHubRepository creates a new repository
func NewHubRepository(pool *pgxpool.Pool) *HubRepository {
	return &HubRepository{pool: pool}
}

// Create creates a hub
func (r *HubRepository) Create(ctx context.Context, h *Hub) error {
	// Set defaults if not provided
	if h.Type == "" {
		h.Type = "public"
	}
	if h.ContentOptions == "" {
		h.ContentOptions = "any"
	}

	query := `
		INSERT INTO hubs (name, description, title, type, content_options, created_by, nsfw)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, is_quarantined, subscriber_count, nsfw
	`
	return r.pool.QueryRow(ctx, query, h.Name, h.Description, h.Title, h.Type, h.ContentOptions, h.CreatedBy, h.NSFW).
		Scan(&h.ID, &h.CreatedAt, &h.IsQuarantined, &h.SubscriberCount, &h.NSFW)
}

// GetByName fetches hub by name
func (r *HubRepository) GetByName(ctx context.Context, name string) (*Hub, error) {
	h := &Hub{}
	query := `
		SELECT id, name, description, title, type, content_options, is_quarantined, subscriber_count, created_by, created_at, nsfw
		FROM hubs
		WHERE name = $1
	`
	err := r.pool.QueryRow(ctx, query, name).Scan(&h.ID, &h.Name, &h.Description, &h.Title, &h.Type, &h.ContentOptions, &h.IsQuarantined, &h.SubscriberCount, &h.CreatedBy, &h.CreatedAt, &h.NSFW)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return h, nil
}

// GetByID fetches hub by id
func (r *HubRepository) GetByID(ctx context.Context, id int) (*Hub, error) {
	h := &Hub{}
	query := `
		SELECT id, name, description, title, type, content_options, is_quarantined, subscriber_count, created_by, created_at, nsfw
		FROM hubs
		WHERE id = $1
	`
	err := r.pool.QueryRow(ctx, query, id).Scan(&h.ID, &h.Name, &h.Description, &h.Title, &h.Type, &h.ContentOptions, &h.IsQuarantined, &h.SubscriberCount, &h.CreatedBy, &h.CreatedAt, &h.NSFW)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return h, nil
}

// List returns paginated hubs
func (r *HubRepository) List(ctx context.Context, limit, offset int) ([]*Hub, error) {
	query := `
		SELECT id, name, description, title, type, content_options, is_quarantined, subscriber_count, created_by, created_at, nsfw
		FROM hubs
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`
	rows, err := r.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hubs []*Hub
	for rows.Next() {
		h := &Hub{}
		if err := rows.Scan(&h.ID, &h.Name, &h.Description, &h.Title, &h.Type, &h.ContentOptions, &h.IsQuarantined, &h.SubscriberCount, &h.CreatedBy, &h.CreatedAt, &h.NSFW); err != nil {
			return nil, err
		}
		hubs = append(hubs, h)
	}
	return hubs, rows.Err()
}

// GetPopularHubs returns hubs sorted by subscriber count (for trending/popular lists)
func (r *HubRepository) GetPopularHubs(ctx context.Context, limit, offset int) ([]*Hub, error) {
	query := `
		SELECT id, name, description, title, type, content_options, is_quarantined, subscriber_count, created_by, created_at, nsfw
		FROM hubs
		WHERE is_quarantined = FALSE
		ORDER BY subscriber_count DESC, created_at DESC
		LIMIT $1 OFFSET $2
	`
	rows, err := r.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hubs []*Hub
	for rows.Next() {
		h := &Hub{}
		if err := rows.Scan(&h.ID, &h.Name, &h.Description, &h.Title, &h.Type, &h.ContentOptions, &h.IsQuarantined, &h.SubscriberCount, &h.CreatedBy, &h.CreatedAt, &h.NSFW); err != nil {
			return nil, err
		}
		hubs = append(hubs, h)
	}
	return hubs, rows.Err()
}

// SearchHubs searches for hubs by name (autocomplete)
func (r *HubRepository) SearchHubs(ctx context.Context, query string, limit int) ([]*Hub, error) {
	sql := `
		SELECT id, name, description, title, type, content_options, is_quarantined, subscriber_count, created_by, created_at
		FROM hubs
		WHERE name ILIKE $1 OR COALESCE(title, '') ILIKE $1
		ORDER BY subscriber_count DESC, name ASC
		LIMIT $2
	`
	searchPattern := "%" + query + "%"
	rows, err := r.pool.Query(ctx, sql, searchPattern, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hubs []*Hub
	for rows.Next() {
		h := &Hub{}
		if err := rows.Scan(&h.ID, &h.Name, &h.Description, &h.Title, &h.Type, &h.ContentOptions, &h.IsQuarantined, &h.SubscriberCount, &h.CreatedBy, &h.CreatedAt); err != nil {
			return nil, err
		}
		hubs = append(hubs, h)
	}
	return hubs, rows.Err()
}

// GetTrendingHubs returns trending hubs
// TODO: Implement growth rate algorithm based on subscriber growth over time
// For now, just returns popular hubs
func (r *HubRepository) GetTrendingHubs(ctx context.Context, limit int) ([]*Hub, error) {
	return r.GetPopularHubs(ctx, limit, 0)
}

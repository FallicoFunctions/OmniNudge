package models

import (
	"context"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Hub represents a site-local community
type Hub struct {
	ID              int       `json:"id"`
	Name            string    `json:"name"`
	NameNormalized  string    `json:"-"` // Lowercase name for case-insensitive lookups
	Description     *string   `json:"description,omitempty"`
	Title           *string   `json:"title,omitempty"`  // Display title for the hub
	Type            string    `json:"type"`             // public or private
	ContentOptions  string    `json:"content_options"`  // any, links_only, text_only, images_only, videos_only, or custom
	IsQuarantined   bool      `json:"is_quarantined"`   // Whether hub is quarantined
	SubscriberCount int       `json:"subscriber_count"` // Number of subscribers
	CreatedBy       *int      `json:"created_by,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	NSFW            bool      `json:"nsfw"`
}

// HubTarget represents a hub with topic filter metadata for agent classification.
type HubTarget struct {
	ID           int      `json:"id"`
	Name         string   `json:"name"`
	Title        *string  `json:"title,omitempty"`
	Description  *string  `json:"description,omitempty"`
	DenyKeywords []string `json:"deny_keywords"`
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
	// Set normalized name for case-insensitive uniqueness
	h.NameNormalized = strings.ToLower(h.Name)

	// Set defaults if not provided
	if h.Type == "" {
		h.Type = "public"
	}
	if h.ContentOptions == "" {
		h.ContentOptions = "any"
	}

	query := `
		INSERT INTO hubs (name, name_normalized, description, title, type, content_options, created_by, nsfw)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at, is_quarantined, subscriber_count, nsfw
	`
	return r.pool.QueryRow(ctx, query, h.Name, h.NameNormalized, h.Description, h.Title, h.Type, h.ContentOptions, h.CreatedBy, h.NSFW).
		Scan(&h.ID, &h.CreatedAt, &h.IsQuarantined, &h.SubscriberCount, &h.NSFW)
}

// GetByName fetches hub by name (case-insensitive)
func (r *HubRepository) GetByName(ctx context.Context, name string) (*Hub, error) {
	if name == "" {
		return nil, nil
	}

	// Use name_normalized for case-insensitive lookup
	normalizedName := strings.ToLower(strings.TrimSpace(name))

	h := &Hub{}
	query := `
		SELECT id, name, description, title, type, content_options, is_quarantined, subscriber_count, created_by, created_at, nsfw
		FROM hubs
		WHERE name_normalized = $1
	`
	err := r.pool.QueryRow(ctx, query, normalizedName).Scan(&h.ID, &h.Name, &h.Description, &h.Title, &h.Type, &h.ContentOptions, &h.IsQuarantined, &h.SubscriberCount, &h.CreatedBy, &h.CreatedAt, &h.NSFW)
	if err != nil {
		if err == pgx.ErrNoRows {
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
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return h, nil
}

// List returns paginated hubs
func (r *HubRepository) List(ctx context.Context, limit, offset int, includeNsfw bool) ([]*Hub, error) {
	query := `
		SELECT id, name, description, title, type, content_options, is_quarantined, subscriber_count, created_by, created_at, nsfw
		FROM hubs
		WHERE ($3 = TRUE OR nsfw = FALSE)
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`
	rows, err := r.pool.Query(ctx, query, limit, offset, includeNsfw)
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

// ListAgentTargets returns hubs with topic filter metadata for agent classification.
func (r *HubRepository) ListAgentTargets(ctx context.Context) ([]*HubTarget, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT h.id, h.name, h.title, h.description, COALESCE(htf.deny_keywords, '{}'::text[])
		FROM hubs h
		LEFT JOIN hub_topic_filters htf ON h.id = htf.hub_id
		WHERE h.type = 'public'
		ORDER BY h.name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var targets []*HubTarget
	for rows.Next() {
		t := &HubTarget{}
		if err := rows.Scan(&t.ID, &t.Name, &t.Title, &t.Description, &t.DenyKeywords); err != nil {
			return nil, err
		}
		targets = append(targets, t)
	}

	return targets, rows.Err()
}

// UpsertHubTopicFilters stores deny keywords for a hub.
func (r *HubRepository) UpsertHubTopicFilters(ctx context.Context, hubID int, denyKeywords []string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO hub_topic_filters (hub_id, deny_keywords)
		VALUES ($1, $2)
		ON CONFLICT (hub_id) DO UPDATE
		SET deny_keywords = EXCLUDED.deny_keywords
	`, hubID, denyKeywords)
	return err
}

// ListByPrefix returns paginated hubs filtered by name prefix.
func (r *HubRepository) ListByPrefix(ctx context.Context, prefix string, limit, offset int, includeNsfw bool) ([]*Hub, error) {
	query := `
		SELECT id, name, description, title, type, content_options, is_quarantined, subscriber_count, created_by, created_at, nsfw
		FROM hubs
		WHERE name ILIKE $1
		  AND ($4 = TRUE OR nsfw = FALSE)
		ORDER BY name ASC, created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.pool.Query(ctx, query, prefix+"%", limit, offset, includeNsfw)
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

// GetTrendingHubs currently uses subscriber count as its stable popularity
// signal; subscription history is retained separately for future time-windowed
// ranking experiments.
func (r *HubRepository) GetTrendingHubs(ctx context.Context, limit int) ([]*Hub, error) {
	return r.GetPopularHubs(ctx, limit, 0)
}

// UpdateNSFW updates the hub's NSFW status
func (r *HubRepository) UpdateNSFW(ctx context.Context, hubID int, nsfw bool) error {
	query := `UPDATE hubs SET nsfw = $1 WHERE id = $2`
	_, err := r.pool.Exec(ctx, query, nsfw, hubID)
	return err
}

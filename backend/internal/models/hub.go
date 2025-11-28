package models

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Hub represents a site-local community
type Hub struct {
	ID          int        `json:"id"`
	Name        string     `json:"name"`
	Description *string    `json:"description,omitempty"`
	CreatedBy   *int       `json:"created_by,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
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
	query := `
		INSERT INTO hubs (name, description, created_by)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`
	return r.pool.QueryRow(ctx, query, h.Name, h.Description, h.CreatedBy).Scan(&h.ID, &h.CreatedAt)
}

// GetByName fetches hub by name
func (r *HubRepository) GetByName(ctx context.Context, name string) (*Hub, error) {
	h := &Hub{}
	query := `
		SELECT id, name, description, created_by, created_at
		FROM hubs
		WHERE name = $1
	`
	err := r.pool.QueryRow(ctx, query, name).Scan(&h.ID, &h.Name, &h.Description, &h.CreatedBy, &h.CreatedAt)
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
		SELECT id, name, description, created_by, created_at
		FROM hubs
		WHERE id = $1
	`
	err := r.pool.QueryRow(ctx, query, id).Scan(&h.ID, &h.Name, &h.Description, &h.CreatedBy, &h.CreatedAt)
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
		SELECT id, name, description, created_by, created_at
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
		if err := rows.Scan(&h.ID, &h.Name, &h.Description, &h.CreatedBy, &h.CreatedAt); err != nil {
			return nil, err
		}
		hubs = append(hubs, h)
	}
	return hubs, rows.Err()
}

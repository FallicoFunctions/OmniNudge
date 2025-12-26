package models

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RemovalReason struct {
	ID        int       `json:"id"`
	HubID     int       `json:"hub_id"`
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	CreatedBy int       `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type RemovalReasonRepository struct {
	db *pgxpool.Pool
}

func NewRemovalReasonRepository(db *pgxpool.Pool) *RemovalReasonRepository {
	return &RemovalReasonRepository{db: db}
}

// Create creates a new removal reason template
func (r *RemovalReasonRepository) Create(ctx context.Context, hubID, createdBy int, title, message string) (*RemovalReason, error) {
	query := `
		INSERT INTO removal_reasons (hub_id, title, message, created_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id, hub_id, title, message, created_by, created_at, updated_at
	`

	var reason RemovalReason
	err := r.db.QueryRow(ctx, query, hubID, title, message, createdBy).Scan(
		&reason.ID, &reason.HubID, &reason.Title, &reason.Message, &reason.CreatedBy,
		&reason.CreatedAt, &reason.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create removal reason: %w", err)
	}

	return &reason, nil
}

// Update updates an existing removal reason
func (r *RemovalReasonRepository) Update(ctx context.Context, id int, title, message string) (*RemovalReason, error) {
	query := `
		UPDATE removal_reasons
		SET title = $2, message = $3, updated_at = NOW()
		WHERE id = $1
		RETURNING id, hub_id, title, message, created_by, created_at, updated_at
	`

	var reason RemovalReason
	err := r.db.QueryRow(ctx, query, id, title, message).Scan(
		&reason.ID, &reason.HubID, &reason.Title, &reason.Message, &reason.CreatedBy,
		&reason.CreatedAt, &reason.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("removal reason %d not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to update removal reason: %w", err)
	}

	return &reason, nil
}

// Delete deletes a removal reason
func (r *RemovalReasonRepository) Delete(ctx context.Context, id int) error {
	query := `DELETE FROM removal_reasons WHERE id = $1`

	result, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete removal reason: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("removal reason %d not found", id)
	}

	return nil
}

// GetByID gets a removal reason by ID
func (r *RemovalReasonRepository) GetByID(ctx context.Context, id int) (*RemovalReason, error) {
	query := `
		SELECT id, hub_id, title, message, created_by, created_at, updated_at
		FROM removal_reasons
		WHERE id = $1
	`

	var reason RemovalReason
	err := r.db.QueryRow(ctx, query, id).Scan(
		&reason.ID, &reason.HubID, &reason.Title, &reason.Message, &reason.CreatedBy,
		&reason.CreatedAt, &reason.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get removal reason: %w", err)
	}

	return &reason, nil
}

// GetByHub lists all removal reasons for a hub
func (r *RemovalReasonRepository) GetByHub(ctx context.Context, hubID int) ([]*RemovalReason, error) {
	query := `
		SELECT id, hub_id, title, message, created_by, created_at, updated_at
		FROM removal_reasons
		WHERE hub_id = $1
		ORDER BY title ASC
	`

	rows, err := r.db.Query(ctx, query, hubID)
	if err != nil {
		return nil, fmt.Errorf("failed to get removal reasons: %w", err)
	}
	defer rows.Close()

	var reasons []*RemovalReason
	for rows.Next() {
		var reason RemovalReason
		err := rows.Scan(
			&reason.ID, &reason.HubID, &reason.Title, &reason.Message, &reason.CreatedBy,
			&reason.CreatedAt, &reason.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan removal reason: %w", err)
		}
		reasons = append(reasons, &reason)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating removal reasons: %w", err)
	}

	return reasons, nil
}

package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AccessRequestStatus string

const (
	AccessRequestStatusPending  AccessRequestStatus = "pending"
	AccessRequestStatusApproved AccessRequestStatus = "approved"
	AccessRequestStatusDenied   AccessRequestStatus = "denied"
)

type HubAccessRequest struct {
	ID        int                 `json:"id"`
	HubID     int                 `json:"hub_id"`
	UserID    int                 `json:"user_id"`
	Status    AccessRequestStatus `json:"status"`
	Message   *string             `json:"message,omitempty"`
	CreatedAt time.Time           `json:"created_at"`
	UpdatedAt time.Time           `json:"updated_at"`

	// Populated from joins
	Username *string `json:"username,omitempty"`
	HubName  *string `json:"hub_name,omitempty"`
}

type HubAccessRequestRepository struct {
	pool *pgxpool.Pool
}

func NewHubAccessRequestRepository(pool *pgxpool.Pool) *HubAccessRequestRepository {
	return &HubAccessRequestRepository{pool: pool}
}

func (r *HubAccessRequestRepository) Create(ctx context.Context, req *HubAccessRequest) error {
	query := `
		INSERT INTO hub_access_requests (hub_id, user_id, message)
		VALUES ($1, $2, $3)
		RETURNING id, created_at, updated_at
	`
	return r.pool.QueryRow(ctx, query, req.HubID, req.UserID, req.Message).
		Scan(&req.ID, &req.CreatedAt, &req.UpdatedAt)
}

func (r *HubAccessRequestRepository) CreateApproved(ctx context.Context, req *HubAccessRequest) error {
	query := `
		INSERT INTO hub_access_requests (hub_id, user_id, status, message)
		VALUES ($1, $2, 'approved', $3)
		RETURNING id, created_at, updated_at
	`
	return r.pool.QueryRow(ctx, query, req.HubID, req.UserID, req.Message).
		Scan(&req.ID, &req.CreatedAt, &req.UpdatedAt)
}

func (r *HubAccessRequestRepository) GetByID(ctx context.Context, id int) (*HubAccessRequest, error) {
	req := &HubAccessRequest{}
	query := `
		SELECT id, hub_id, user_id, status, message, created_at, updated_at
		FROM hub_access_requests
		WHERE id = $1
	`
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&req.ID, &req.HubID, &req.UserID, &req.Status, &req.Message,
		&req.CreatedAt, &req.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return req, nil
}

func (r *HubAccessRequestRepository) GetPendingByHub(ctx context.Context, hubID int) ([]HubAccessRequest, error) {
	query := `
		SELECT ar.id, ar.hub_id, ar.user_id, ar.status, ar.message, ar.created_at, ar.updated_at,
		       u.username, h.name as hub_name
		FROM hub_access_requests ar
		JOIN users u ON ar.user_id = u.id
		JOIN hubs h ON ar.hub_id = h.id
		WHERE ar.hub_id = $1 AND ar.status = 'pending'
		ORDER BY ar.created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, hubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []HubAccessRequest
	for rows.Next() {
		var req HubAccessRequest
		err := rows.Scan(
			&req.ID, &req.HubID, &req.UserID, &req.Status, &req.Message,
			&req.CreatedAt, &req.UpdatedAt, &req.Username, &req.HubName,
		)
		if err != nil {
			return nil, err
		}
		requests = append(requests, req)
	}
	return requests, rows.Err()
}

func (r *HubAccessRequestRepository) GetByUserAndHub(ctx context.Context, hubID, userID int) (*HubAccessRequest, error) {
	req := &HubAccessRequest{}
	query := `
		SELECT id, hub_id, user_id, status, message, created_at, updated_at
		FROM hub_access_requests
		WHERE hub_id = $1 AND user_id = $2
		ORDER BY created_at DESC
		LIMIT 1
	`
	err := r.pool.QueryRow(ctx, query, hubID, userID).Scan(
		&req.ID, &req.HubID, &req.UserID, &req.Status, &req.Message,
		&req.CreatedAt, &req.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return req, nil
}

func (r *HubAccessRequestRepository) GetUserAccessRequests(ctx context.Context, userID int) ([]HubAccessRequest, error) {
	query := `
		SELECT ar.id, ar.hub_id, ar.user_id, ar.status, ar.message, ar.created_at, ar.updated_at,
		       u.username, h.name as hub_name
		FROM hub_access_requests ar
		JOIN users u ON ar.user_id = u.id
		JOIN hubs h ON ar.hub_id = h.id
		WHERE ar.user_id = $1
		ORDER BY ar.created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []HubAccessRequest
	for rows.Next() {
		var req HubAccessRequest
		err := rows.Scan(
			&req.ID, &req.HubID, &req.UserID, &req.Status, &req.Message,
			&req.CreatedAt, &req.UpdatedAt, &req.Username, &req.HubName,
		)
		if err != nil {
			return nil, err
		}
		requests = append(requests, req)
	}
	return requests, rows.Err()
}

func (r *HubAccessRequestRepository) Approve(ctx context.Context, id int) error {
	query := `
		UPDATE hub_access_requests
		SET status = 'approved', updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, id)
	return err
}

func (r *HubAccessRequestRepository) Deny(ctx context.Context, id int) error {
	query := `
		UPDATE hub_access_requests
		SET status = 'denied', updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, id)
	return err
}

func (r *HubAccessRequestRepository) HasPendingRequest(ctx context.Context, hubID, userID int) (bool, error) {
	var exists bool
	query := `
		SELECT EXISTS (
			SELECT 1 FROM hub_access_requests
			WHERE hub_id = $1 AND user_id = $2 AND status = 'pending'
		)
	`
	err := r.pool.QueryRow(ctx, query, hubID, userID).Scan(&exists)
	return exists, err
}

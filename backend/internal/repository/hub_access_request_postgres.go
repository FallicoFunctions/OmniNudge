package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.HubAccessRequestRepository = (*PostgresHubAccessRequestRepository)(nil)

// PostgresHubAccessRequestRepository wraps the model-layer repository.
type PostgresHubAccessRequestRepository struct {
	inner *models.HubAccessRequestRepository
}

// NewPostgresHubAccessRequestRepository constructs the adapter.
func NewPostgresHubAccessRequestRepository(pool *pgxpool.Pool) ports.HubAccessRequestRepository {
	return &PostgresHubAccessRequestRepository{inner: models.NewHubAccessRequestRepository(pool)}
}

func (r *PostgresHubAccessRequestRepository) Create(ctx context.Context, req *domain.HubAccessRequest) error {
	return r.inner.Create(ctx, req)
}

func (r *PostgresHubAccessRequestRepository) CreateApproved(ctx context.Context, req *domain.HubAccessRequest) error {
	return r.inner.CreateApproved(ctx, req)
}

func (r *PostgresHubAccessRequestRepository) GetByID(ctx context.Context, id int) (*domain.HubAccessRequest, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresHubAccessRequestRepository) GetPendingByHub(ctx context.Context, hubID int) ([]domain.HubAccessRequest, error) {
	return r.inner.GetPendingByHub(ctx, hubID)
}

func (r *PostgresHubAccessRequestRepository) GetByUserAndHub(ctx context.Context, hubID, userID int) (*domain.HubAccessRequest, error) {
	return r.inner.GetByUserAndHub(ctx, hubID, userID)
}

func (r *PostgresHubAccessRequestRepository) GetUserAccessRequests(ctx context.Context, userID int) ([]domain.HubAccessRequest, error) {
	return r.inner.GetUserAccessRequests(ctx, userID)
}

func (r *PostgresHubAccessRequestRepository) Approve(ctx context.Context, id int) error {
	return r.inner.Approve(ctx, id)
}

func (r *PostgresHubAccessRequestRepository) Deny(ctx context.Context, id int) error {
	return r.inner.Deny(ctx, id)
}

func (r *PostgresHubAccessRequestRepository) HasPendingRequest(ctx context.Context, hubID, userID int) (bool, error) {
	return r.inner.HasPendingRequest(ctx, hubID, userID)
}

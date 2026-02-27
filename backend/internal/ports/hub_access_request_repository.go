package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// HubAccessRequestRepository defines the persistence contract for hub access requests.
type HubAccessRequestRepository interface {
	Create(ctx context.Context, req *domain.HubAccessRequest) error
	CreateApproved(ctx context.Context, req *domain.HubAccessRequest) error
	GetByID(ctx context.Context, id int) (*domain.HubAccessRequest, error)
	GetPendingByHub(ctx context.Context, hubID int) ([]domain.HubAccessRequest, error)
	GetByUserAndHub(ctx context.Context, hubID, userID int) (*domain.HubAccessRequest, error)
	GetUserAccessRequests(ctx context.Context, userID int) ([]domain.HubAccessRequest, error)
	Approve(ctx context.Context, id int) error
	Deny(ctx context.Context, id int) error
	HasPendingRequest(ctx context.Context, hubID, userID int) (bool, error)
}

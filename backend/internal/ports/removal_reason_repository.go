package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// RemovalReasonRepository defines the interface for removal reason persistence operations.
type RemovalReasonRepository interface {
	Create(ctx context.Context, hubID, createdBy int, title, message string) (*domain.RemovalReason, error)
	Update(ctx context.Context, id int, title, message string) (*domain.RemovalReason, error)
	Delete(ctx context.Context, id int) error
	GetByID(ctx context.Context, id int) (*domain.RemovalReason, error)
	GetByHub(ctx context.Context, hubID int) ([]*domain.RemovalReason, error)
}

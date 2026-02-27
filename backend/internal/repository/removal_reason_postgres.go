package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresRemovalReasonRepository is a thin adapter over models.RemovalReasonRepository.
type PostgresRemovalReasonRepository struct {
	inner *models.RemovalReasonRepository
}

var _ ports.RemovalReasonRepository = (*PostgresRemovalReasonRepository)(nil)

// NewPostgresRemovalReasonRepository constructs a PostgresRemovalReasonRepository.
func NewPostgresRemovalReasonRepository(pool *pgxpool.Pool) ports.RemovalReasonRepository {
	return &PostgresRemovalReasonRepository{inner: models.NewRemovalReasonRepository(pool)}
}

func (r *PostgresRemovalReasonRepository) Create(ctx context.Context, hubID, createdBy int, title, message string) (*domain.RemovalReason, error) {
	return r.inner.Create(ctx, hubID, createdBy, title, message)
}

func (r *PostgresRemovalReasonRepository) Update(ctx context.Context, id int, title, message string) (*domain.RemovalReason, error) {
	return r.inner.Update(ctx, id, title, message)
}

func (r *PostgresRemovalReasonRepository) Delete(ctx context.Context, id int) error {
	return r.inner.Delete(ctx, id)
}

func (r *PostgresRemovalReasonRepository) GetByID(ctx context.Context, id int) (*domain.RemovalReason, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresRemovalReasonRepository) GetByHub(ctx context.Context, hubID int) ([]*domain.RemovalReason, error) {
	return r.inner.GetByHub(ctx, hubID)
}

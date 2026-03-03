package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.EmailVerificationRepository = (*PostgresEmailVerificationRepository)(nil)

// PostgresEmailVerificationRepository wraps the model-layer repository.
type PostgresEmailVerificationRepository struct {
	inner *models.EmailVerificationRepository
}

// NewPostgresEmailVerificationRepository constructs the adapter.
func NewPostgresEmailVerificationRepository(pool *pgxpool.Pool) ports.EmailVerificationRepository {
	return &PostgresEmailVerificationRepository{inner: models.NewEmailVerificationRepository(pool)}
}

func (r *PostgresEmailVerificationRepository) GenerateToken(ctx context.Context, userID int, email, purpose string) (*domain.EmailVerification, error) {
	return r.inner.GenerateToken(ctx, userID, email, purpose)
}

func (r *PostgresEmailVerificationRepository) Verify(ctx context.Context, token string) (*domain.EmailVerification, error) {
	return r.inner.Verify(ctx, token)
}

func (r *PostgresEmailVerificationRepository) IsValid(ctx context.Context, token string) (bool, int, string, error) {
	return r.inner.IsValid(ctx, token)
}

func (r *PostgresEmailVerificationRepository) InvalidateUserTokens(ctx context.Context, userID int, purpose string) error {
	return r.inner.InvalidateUserTokens(ctx, userID, purpose)
}

func (r *PostgresEmailVerificationRepository) GetByToken(ctx context.Context, token string) (*domain.EmailVerification, error) {
	return r.inner.GetByToken(ctx, token)
}

func (r *PostgresEmailVerificationRepository) GetPendingVerification(ctx context.Context, userID int, purpose string) (*domain.EmailVerification, error) {
	return r.inner.GetPendingVerification(ctx, userID, purpose)
}

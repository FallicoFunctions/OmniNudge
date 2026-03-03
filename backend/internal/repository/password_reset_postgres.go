package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.PasswordResetRepository = (*PostgresPasswordResetRepository)(nil)

// PostgresPasswordResetRepository wraps the model-layer repository.
type PostgresPasswordResetRepository struct {
	inner *models.PasswordResetRepository
}

// NewPostgresPasswordResetRepository constructs the adapter.
func NewPostgresPasswordResetRepository(pool *pgxpool.Pool) ports.PasswordResetRepository {
	return &PostgresPasswordResetRepository{inner: models.NewPasswordResetRepository(pool)}
}

func (r *PostgresPasswordResetRepository) GenerateToken(ctx context.Context, userID int) (*domain.PasswordReset, error) {
	return r.inner.GenerateToken(ctx, userID)
}

func (r *PostgresPasswordResetRepository) GetByToken(ctx context.Context, token string) (*domain.PasswordReset, error) {
	return r.inner.GetByToken(ctx, token)
}

func (r *PostgresPasswordResetRepository) MarkAsUsed(ctx context.Context, token string) error {
	return r.inner.MarkAsUsed(ctx, token)
}

func (r *PostgresPasswordResetRepository) IsValid(ctx context.Context, token string) (bool, int, error) {
	return r.inner.IsValid(ctx, token)
}

func (r *PostgresPasswordResetRepository) DeleteOldTokens(ctx context.Context) (int64, error) {
	return r.inner.DeleteOldTokens(ctx)
}

func (r *PostgresPasswordResetRepository) InvalidateUserTokens(ctx context.Context, userID int) error {
	return r.inner.InvalidateUserTokens(ctx, userID)
}

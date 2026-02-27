package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// PasswordResetRepository defines the persistence contract for password resets.
type PasswordResetRepository interface {
	GenerateToken(ctx context.Context, userID int) (*domain.PasswordReset, error)
	GetByToken(ctx context.Context, token string) (*domain.PasswordReset, error)
	MarkAsUsed(ctx context.Context, token string) error
	IsValid(ctx context.Context, token string) (bool, int, error)
	DeleteOldTokens(ctx context.Context) (int64, error)
	InvalidateUserTokens(ctx context.Context, userID int) error
}

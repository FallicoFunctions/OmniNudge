package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// EmailVerificationRepository defines the persistence contract for email verifications.
type EmailVerificationRepository interface {
	GenerateToken(ctx context.Context, userID int, email, purpose string) (*domain.EmailVerification, error)
	Verify(ctx context.Context, token string) (*domain.EmailVerification, error)
	IsValid(ctx context.Context, token string) (bool, int, string, error)
	InvalidateUserTokens(ctx context.Context, userID int, purpose string) error
	GetByToken(ctx context.Context, token string) (*domain.EmailVerification, error)
	GetPendingVerification(ctx context.Context, userID int, purpose string) (*domain.EmailVerification, error)
}

package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresUserRepository adapts models.UserRepository to ports.UserRepository.
// Because domain.* types are aliases for models.* types, no conversion is needed.
type PostgresUserRepository struct {
	inner *models.UserRepository
}

// Compile-time interface check.
var _ ports.UserRepository = (*PostgresUserRepository)(nil)

// NewPostgresUserRepository creates a PostgresUserRepository satisfying ports.UserRepository.
func NewPostgresUserRepository(pool *pgxpool.Pool) ports.UserRepository {
	return &PostgresUserRepository{inner: models.NewUserRepository(pool)}
}

func (r *PostgresUserRepository) Create(ctx context.Context, user *domain.User) error {
	return r.inner.Create(ctx, user)
}

func (r *PostgresUserRepository) CreateOrUpdateFromReddit(ctx context.Context, user *domain.User) error {
	return r.inner.CreateOrUpdateFromReddit(ctx, user)
}

func (r *PostgresUserRepository) GetByID(ctx context.Context, id int) (*domain.User, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresUserRepository) GetByUsername(ctx context.Context, username string) (*domain.User, error) {
	return r.inner.GetByUsername(ctx, username)
}

func (r *PostgresUserRepository) GetByRedditID(ctx context.Context, redditID string) (*domain.User, error) {
	return r.inner.GetByRedditID(ctx, redditID)
}

func (r *PostgresUserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	return r.inner.GetByEmail(ctx, email)
}

func (r *PostgresUserRepository) GetPublicKeysByIDs(ctx context.Context, userIDs []int) (map[int]string, error) {
	return r.inner.GetPublicKeysByIDs(ctx, userIDs)
}

func (r *PostgresUserRepository) ListUserIDsByRoles(ctx context.Context, roles []string) ([]int, error) {
	return r.inner.ListUserIDsByRoles(ctx, roles)
}

func (r *PostgresUserRepository) ListUserContactsByRoles(ctx context.Context, roles []string) ([]domain.UserRoleContact, error) {
	return r.inner.ListUserContactsByRoles(ctx, roles)
}

func (r *PostgresUserRepository) UpdateLastSeen(ctx context.Context, userID int) error {
	return r.inner.UpdateLastSeen(ctx, userID)
}

func (r *PostgresUserRepository) UpdateRole(ctx context.Context, userID int, role string) error {
	return r.inner.UpdateRole(ctx, userID, role)
}

func (r *PostgresUserRepository) UpdatePublicKey(ctx context.Context, userID int, publicKey string) error {
	return r.inner.UpdatePublicKey(ctx, userID, publicKey)
}

func (r *PostgresUserRepository) UpdateProfile(ctx context.Context, userID int, bio *string, avatarURL *string) error {
	return r.inner.UpdateProfile(ctx, userID, bio, avatarURL)
}

func (r *PostgresUserRepository) UpdatePassword(ctx context.Context, userID int, passwordHash string) error {
	return r.inner.UpdatePassword(ctx, userID, passwordHash)
}

func (r *PostgresUserRepository) UpdateLastAgentPostAt(ctx context.Context, userID int, timestamp time.Time) error {
	return r.inner.UpdateLastAgentPostAt(ctx, userID, timestamp)
}

func (r *PostgresUserRepository) UpdateLastAgentBrowseAt(ctx context.Context, userID int, timestamp time.Time) error {
	return r.inner.UpdateLastAgentBrowseAt(ctx, userID, timestamp)
}

func (r *PostgresUserRepository) UpdateEncryptedPrivateKey(ctx context.Context, userID int, encryptedPrivateKey string) error {
	return r.inner.UpdateEncryptedPrivateKey(ctx, userID, encryptedPrivateKey)
}

func (r *PostgresUserRepository) UpdateEmail(ctx context.Context, userID int, email *string) error {
	return r.inner.UpdateEmail(ctx, userID, email)
}

func (r *PostgresUserRepository) UpdateVerifiedEmail(ctx context.Context, userID int, encryptedEmail string) error {
	return r.inner.UpdateVerifiedEmail(ctx, userID, encryptedEmail)
}

func (r *PostgresUserRepository) GetBanStatus(ctx context.Context, userID int) (*domain.BanStatus, error) {
	return r.inner.GetBanStatus(ctx, userID)
}

func (r *PostgresUserRepository) ShadowBanUser(ctx context.Context, userID int, reason string, showReason bool, adminID int) error {
	return r.inner.ShadowBanUser(ctx, userID, reason, showReason, adminID)
}

func (r *PostgresUserRepository) BanUser(ctx context.Context, userID int, reason string, showReason bool, adminID int) error {
	return r.inner.BanUser(ctx, userID, reason, showReason, adminID)
}

func (r *PostgresUserRepository) AutoSuspendForReports(ctx context.Context, userID int, reason string) error {
	return r.inner.AutoSuspendForReports(ctx, userID, reason)
}

func (r *PostgresUserRepository) UnbanUser(ctx context.Context, userID int, reason string, adminID int) error {
	return r.inner.UnbanUser(ctx, userID, reason, adminID)
}

func (r *PostgresUserRepository) SoftDeleteUser(ctx context.Context, userID int, reason string, adminID int) error {
	return r.inner.SoftDeleteUser(ctx, userID, reason, adminID)
}

func (r *PostgresUserRepository) GetBanHistory(ctx context.Context, userID int) ([]domain.BanHistory, error) {
	return r.inner.GetBanHistory(ctx, userID)
}

func (r *PostgresUserRepository) GetAllBanHistory(ctx context.Context, limit, offset int) ([]domain.BanHistory, error) {
	return r.inner.GetAllBanHistory(ctx, limit, offset)
}

func (r *PostgresUserRepository) GetAllBanHistoryWithCursor(ctx context.Context, limit int, cursor *domain.TimeCursor) ([]domain.BanHistory, error) {
	return r.inner.GetAllBanHistoryWithCursor(ctx, limit, cursor)
}

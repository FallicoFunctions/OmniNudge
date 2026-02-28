package ports

import (
	"context"
	"time"

	"github.com/omninudge/backend/internal/domain"
)

// UserRepository defines persistence operations for users.
type UserRepository interface {
	Create(ctx context.Context, user *domain.User) error
	CreateOrUpdateFromReddit(ctx context.Context, user *domain.User) error
	GetByID(ctx context.Context, id int) (*domain.User, error)
	GetByUsername(ctx context.Context, username string) (*domain.User, error)
	GetByRedditID(ctx context.Context, redditID string) (*domain.User, error)
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
	GetPublicKeysByIDs(ctx context.Context, userIDs []int) (map[int]string, error)
	ListUserIDsByRoles(ctx context.Context, roles []string) ([]int, error)
	ListUserContactsByRoles(ctx context.Context, roles []string) ([]domain.UserRoleContact, error)
	UpdateLastSeen(ctx context.Context, userID int) error
	UpdateRole(ctx context.Context, userID int, role string) error
	UpdatePublicKey(ctx context.Context, userID int, publicKey string) error
	UpdateProfile(ctx context.Context, userID int, bio *string, avatarURL *string, nsfw *bool) error
	UpdatePassword(ctx context.Context, userID int, passwordHash string) error
	UpdateLastAgentPostAt(ctx context.Context, userID int, timestamp time.Time) error
	UpdateLastAgentBrowseAt(ctx context.Context, userID int, timestamp time.Time) error
	UpdateEncryptedPrivateKey(ctx context.Context, userID int, encryptedPrivateKey string) error
	UpdateEmail(ctx context.Context, userID int, email *string) error
	UpdateVerifiedEmail(ctx context.Context, userID int, encryptedEmail string) error
	GetBanStatus(ctx context.Context, userID int) (*domain.BanStatus, error)
	ShadowBanUser(ctx context.Context, userID int, reason string, showReason bool, adminID int) error
	BanUser(ctx context.Context, userID int, reason string, showReason bool, adminID int) error
	AutoSuspendForReports(ctx context.Context, userID int, reason string) error
	UnbanUser(ctx context.Context, userID int, reason string, adminID int) error
	SoftDeleteUser(ctx context.Context, userID int, reason string, adminID int) error
	GetBanHistory(ctx context.Context, userID int) ([]domain.BanHistory, error)
	GetAllBanHistory(ctx context.Context, limit, offset int) ([]domain.BanHistory, error)
	GetAllBanHistoryWithCursor(ctx context.Context, limit int, cursor *domain.TimeCursor) ([]domain.BanHistory, error)
}

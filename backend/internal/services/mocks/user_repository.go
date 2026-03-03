// Package mocks provides in-memory mock implementations of every ports.*Repository
// interface. Mocks are used exclusively in unit tests — never in production code.
//
// Each mock follows the same pattern:
//   - A map-backed in-memory store as the default implementation.
//   - Optional Func fields (e.g. CreateFunc) that, when non-nil, override the
//     default behaviour so individual test cases can inject errors or custom logic.
//   - A compile-time interface check so that any drift from the real port is caught
//     at build time rather than at runtime.
package mocks

import (
	"context"
	"time"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.UserRepository = (*UserRepository)(nil)

// UserRepository is an in-memory mock of ports.UserRepository.
type UserRepository struct {
	users  map[int]*domain.User
	nextID int

	// Optional overrides — set in test cases to inject specific behaviour.
	CreateFunc                  func(ctx context.Context, user *domain.User) error
	CreateOrUpdateFromRedditFunc func(ctx context.Context, user *domain.User) error
	GetByIDFunc                 func(ctx context.Context, id int) (*domain.User, error)
	GetByUsernameFunc           func(ctx context.Context, username string) (*domain.User, error)
	GetByRedditIDFunc           func(ctx context.Context, redditID string) (*domain.User, error)
	GetByEmailFunc              func(ctx context.Context, email string) (*domain.User, error)
}

// NewUserRepository returns an empty UserRepository mock.
func NewUserRepository() *UserRepository {
	return &UserRepository{users: make(map[int]*domain.User), nextID: 1}
}

func (m *UserRepository) Create(ctx context.Context, user *domain.User) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, user)
	}
	user.ID = m.nextID
	m.nextID++
	now := time.Now()
	user.CreatedAt = now
	copy := *user
	m.users[copy.ID] = &copy
	return nil
}

func (m *UserRepository) CreateOrUpdateFromReddit(ctx context.Context, user *domain.User) error {
	if m.CreateOrUpdateFromRedditFunc != nil {
		return m.CreateOrUpdateFromRedditFunc(ctx, user)
	}
	if user.ID == 0 {
		return m.Create(ctx, user)
	}
	copy := *user
	m.users[copy.ID] = &copy
	return nil
}

func (m *UserRepository) GetByID(ctx context.Context, id int) (*domain.User, error) {
	if m.GetByIDFunc != nil {
		return m.GetByIDFunc(ctx, id)
	}
	u := m.users[id]
	if u == nil {
		return nil, nil
	}
	copy := *u
	return &copy, nil
}

func (m *UserRepository) GetByUsername(ctx context.Context, username string) (*domain.User, error) {
	if m.GetByUsernameFunc != nil {
		return m.GetByUsernameFunc(ctx, username)
	}
	for _, u := range m.users {
		if u.Username == username {
			copy := *u
			return &copy, nil
		}
	}
	return nil, nil
}

func (m *UserRepository) GetByRedditID(ctx context.Context, redditID string) (*domain.User, error) {
	if m.GetByRedditIDFunc != nil {
		return m.GetByRedditIDFunc(ctx, redditID)
	}
	for _, u := range m.users {
		if u.RedditID != nil && *u.RedditID == redditID {
			copy := *u
			return &copy, nil
		}
	}
	return nil, nil
}

func (m *UserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	if m.GetByEmailFunc != nil {
		return m.GetByEmailFunc(ctx, email)
	}
	for _, u := range m.users {
		if u.Email != nil && *u.Email == email {
			copy := *u
			return &copy, nil
		}
	}
	return nil, nil
}

func (m *UserRepository) GetPublicKeysByIDs(_ context.Context, userIDs []int) (map[int]string, error) {
	out := make(map[int]string, len(userIDs))
	for _, id := range userIDs {
		if u, ok := m.users[id]; ok && u.PublicKey != nil {
			out[id] = *u.PublicKey
		}
	}
	return out, nil
}

func (m *UserRepository) ListUserIDsByRoles(_ context.Context, roles []string) ([]int, error) {
	roleSet := make(map[string]bool, len(roles))
	for _, r := range roles {
		roleSet[r] = true
	}
	var ids []int
	for _, u := range m.users {
		if roleSet[u.Role] {
			ids = append(ids, u.ID)
		}
	}
	return ids, nil
}

func (m *UserRepository) ListUserContactsByRoles(_ context.Context, _ []string) ([]domain.UserRoleContact, error) {
	return nil, nil
}

func (m *UserRepository) UpdateLastSeen(_ context.Context, _ int) error { return nil }

func (m *UserRepository) UpdateRole(_ context.Context, userID int, role string) error {
	if u, ok := m.users[userID]; ok {
		u.Role = role
	}
	return nil
}

func (m *UserRepository) UpdatePublicKey(_ context.Context, userID int, publicKey string) error {
	if u, ok := m.users[userID]; ok {
		u.PublicKey = &publicKey
	}
	return nil
}

func (m *UserRepository) UpdateProfile(_ context.Context, userID int, bio *string, avatarURL *string, nsfw *bool) error {
	if u, ok := m.users[userID]; ok {
		if bio != nil {
			u.Bio = bio
		}
		if avatarURL != nil {
			u.AvatarURL = avatarURL
		}
		if nsfw != nil {
			u.NSFW = *nsfw
		}
	}
	return nil
}

func (m *UserRepository) UpdatePassword(_ context.Context, userID int, passwordHash string) error {
	if u, ok := m.users[userID]; ok {
		u.PasswordHash = passwordHash
	}
	return nil
}

func (m *UserRepository) UpdateLastAgentPostAt(_ context.Context, _ int, _ time.Time) error {
	return nil
}

func (m *UserRepository) UpdateLastAgentBrowseAt(_ context.Context, _ int, _ time.Time) error {
	return nil
}

func (m *UserRepository) UpdateEncryptedPrivateKey(_ context.Context, userID int, key string) error {
	if u, ok := m.users[userID]; ok {
		u.EncryptedPrivateKey = &key
	}
	return nil
}

func (m *UserRepository) UpdateEmail(_ context.Context, userID int, email *string) error {
	if u, ok := m.users[userID]; ok {
		u.Email = email
	}
	return nil
}

func (m *UserRepository) UpdateVerifiedEmail(_ context.Context, userID int, encryptedEmail string) error {
	if u, ok := m.users[userID]; ok {
		u.Email = &encryptedEmail
	}
	return nil
}

func (m *UserRepository) GetBanStatus(_ context.Context, userID int) (*domain.BanStatus, error) {
	u, ok := m.users[userID]
	if !ok {
		return nil, nil
	}
	return &domain.BanStatus{Banned: u.Banned}, nil
}

func (m *UserRepository) ShadowBanUser(_ context.Context, userID int, _ string, _ bool, _ int) error {
	if u, ok := m.users[userID]; ok {
		u.Banned = true
	}
	return nil
}

func (m *UserRepository) BanUser(_ context.Context, userID int, reason string, _ bool, _ int) error {
	if u, ok := m.users[userID]; ok {
		u.Banned = true
		u.BanReason = &reason
	}
	return nil
}

func (m *UserRepository) AutoSuspendForReports(_ context.Context, userID int, reason string) error {
	if u, ok := m.users[userID]; ok {
		u.Banned = true
		u.BanReason = &reason
	}
	return nil
}

func (m *UserRepository) UnbanUser(_ context.Context, userID int, _ string, _ int) error {
	if u, ok := m.users[userID]; ok {
		u.Banned = false
		u.BanReason = nil
	}
	return nil
}

func (m *UserRepository) SoftDeleteUser(_ context.Context, userID int, _ string, _ int) error {
	if u, ok := m.users[userID]; ok {
		u.Deleted = true
	}
	return nil
}

func (m *UserRepository) GetBanHistory(_ context.Context, _ int) ([]domain.BanHistory, error) {
	return nil, nil
}

func (m *UserRepository) GetAllBanHistory(_ context.Context, _, _ int) ([]domain.BanHistory, error) {
	return nil, nil
}

func (m *UserRepository) GetAllBanHistoryWithCursor(_ context.Context, _ int, _ *domain.TimeCursor) ([]domain.BanHistory, error) {
	return nil, nil
}

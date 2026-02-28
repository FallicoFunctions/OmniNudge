package services

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/domain"
)

// stubUserRepo is an in-memory stub satisfying the local UserRepository interface.
type stubUserRepo struct {
	byUsername map[string]*domain.User
	byEmail    map[string]*domain.User
}

func newStubUserRepo() *stubUserRepo {
	return &stubUserRepo{
		byUsername: make(map[string]*domain.User),
		byEmail:    make(map[string]*domain.User),
	}
}

func (r *stubUserRepo) GetByUsername(_ context.Context, username string) (*domain.User, error) {
	return r.byUsername[username], nil
}

func (r *stubUserRepo) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	return r.byEmail[email], nil
}

func TestUserDomainService_CheckUsernameAvailable(t *testing.T) {
	repo := newStubUserRepo()
	svc := NewUserDomainService(repo)
	ctx := context.Background()

	t.Run("available", func(t *testing.T) {
		err := svc.CheckUsernameAvailable(ctx, "newuser")
		require.NoError(t, err)
	})

	t.Run("taken", func(t *testing.T) {
		repo.byUsername["taken"] = &domain.User{Username: "taken"}
		err := svc.CheckUsernameAvailable(ctx, "taken")
		require.ErrorIs(t, err, ErrUsernameTaken)
	})
}

func TestUserDomainService_CheckEmailAvailable(t *testing.T) {
	repo := newStubUserRepo()
	svc := NewUserDomainService(repo)
	ctx := context.Background()

	t.Run("available", func(t *testing.T) {
		err := svc.CheckEmailAvailable(ctx, "new@example.com")
		require.NoError(t, err)
	})

	t.Run("taken", func(t *testing.T) {
		email := "taken@example.com"
		repo.byEmail[email] = &domain.User{Username: "someone"}
		err := svc.CheckEmailAvailable(ctx, email)
		require.ErrorIs(t, err, ErrEmailTaken)
	})
}

func TestUserDomainService_CanUserBan(t *testing.T) {
	svc := NewUserDomainService(newStubUserRepo())

	admin := &domain.User{Role: "admin"}
	regularUser := &domain.User{Role: "user"}
	otherAdmin := &domain.User{Role: "admin"}

	t.Run("admin can ban regular user", func(t *testing.T) {
		err := svc.CanUserBan(admin, regularUser)
		require.NoError(t, err)
	})

	t.Run("non-admin cannot ban", func(t *testing.T) {
		err := svc.CanUserBan(regularUser, regularUser)
		require.Error(t, err)
	})

	t.Run("admin cannot ban another admin", func(t *testing.T) {
		err := svc.CanUserBan(admin, otherAdmin)
		require.ErrorIs(t, err, domain.ErrCannotBanAdmin)
	})
}

func TestUserDomainService_CanUserDelete(t *testing.T) {
	svc := NewUserDomainService(newStubUserRepo())

	admin := &domain.User{ID: 1, Role: "admin"}
	regularUser := &domain.User{ID: 2, Role: "user"}
	otherAdmin := &domain.User{ID: 3, Role: "admin"}

	t.Run("admin can delete regular user", func(t *testing.T) {
		err := svc.CanUserDelete(admin, regularUser)
		require.NoError(t, err)
	})

	t.Run("non-admin cannot delete", func(t *testing.T) {
		err := svc.CanUserDelete(regularUser, otherAdmin)
		require.Error(t, err)
	})

	t.Run("cannot delete self", func(t *testing.T) {
		err := svc.CanUserDelete(admin, admin)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "own account")
	})

	t.Run("cannot delete another admin", func(t *testing.T) {
		err := svc.CanUserDelete(admin, otherAdmin)
		require.Error(t, err)
	})
}

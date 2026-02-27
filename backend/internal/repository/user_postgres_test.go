package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresUserRepository_Create(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserRepository(db.Pool)
	ctx := context.Background()

	t.Run("creates user successfully", func(t *testing.T) {
		user := &domain.User{
			Username:     fmt.Sprintf("alice_%d", time.Now().UnixNano()),
			PasswordHash: "hashed_pw",
		}
		err := repo.Create(ctx, user)
		require.NoError(t, err)
		assert.NotZero(t, user.ID)
	})

	t.Run("duplicate username returns error", func(t *testing.T) {
		username := fmt.Sprintf("dup_%d", time.Now().UnixNano())
		first := &domain.User{Username: username, PasswordHash: "pw"}
		require.NoError(t, repo.Create(ctx, first))

		second := &domain.User{Username: username, PasswordHash: "pw"}
		err := repo.Create(ctx, second)
		assert.Error(t, err, "second create with duplicate username should fail")
	})
}

func TestPostgresUserRepository_GetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("getbyid")

	tests := []struct {
		name    string
		id      int
		wantNil bool
	}{
		{"existing user", user.ID, false},
		{"non-existent user", 999999, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByID(ctx, tc.id)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NotNil(t, got)
				assert.Equal(t, user.ID, got.ID)
				assert.Equal(t, user.Username, got.Username)
			}
		})
	}
}

func TestPostgresUserRepository_GetByUsername(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("byusername")

	tests := []struct {
		name     string
		username string
		wantNil  bool
	}{
		{"existing username", user.Username, false},
		{"non-existent username", "no_such_user_xyz", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByUsername(ctx, tc.username)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NotNil(t, got)
				assert.Equal(t, user.Username, got.Username)
			}
		})
	}
}

func TestPostgresUserRepository_UpdateLastSeen(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("lastseen")

	err := repo.UpdateLastSeen(ctx, user.ID)
	assert.NoError(t, err)
}

func TestPostgresUserRepository_UpdateRole(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("updaterole")

	err := repo.UpdateRole(ctx, user.ID, "moderator")
	require.NoError(t, err)

	got, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	assert.Equal(t, "moderator", got.Role)
}

func TestPostgresUserRepository_UpdateProfile(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("updateprofile")
	bio := "My test bio"
	avatar := "https://example.com/avatar.png"

	err := repo.UpdateProfile(ctx, user.ID, &bio, &avatar)
	require.NoError(t, err)

	got, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, got.Bio)
	assert.Equal(t, bio, *got.Bio)
}

func TestPostgresUserRepository_UpdatePassword(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("updatepw")

	err := repo.UpdatePassword(ctx, user.ID, "new_hash")
	assert.NoError(t, err)
}

func TestPostgresUserRepository_UpdatePublicKey(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("pubkey")

	err := repo.UpdatePublicKey(ctx, user.ID, "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----")
	assert.NoError(t, err)
}

func TestPostgresUserRepository_BanAndUnban(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	admin := fx.CreateUniqueUser("admin_ban")
	target := fx.CreateUniqueUser("target_ban")

	// Ban.
	err := repo.BanUser(ctx, target.ID, "spam", true, admin.ID)
	require.NoError(t, err)

	status, err := repo.GetBanStatus(ctx, target.ID)
	require.NoError(t, err)
	require.NotNil(t, status)
	assert.True(t, status.Banned)

	// Unban.
	err = repo.UnbanUser(ctx, target.ID, "resolved", admin.ID)
	require.NoError(t, err)

	status2, err := repo.GetBanStatus(ctx, target.ID)
	require.NoError(t, err)
	require.NotNil(t, status2)
	assert.False(t, status2.Banned)
}

func TestPostgresUserRepository_GetBanHistory(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	admin := fx.CreateUniqueUser("admin_hist")
	target := fx.CreateUniqueUser("target_hist")

	_ = repo.BanUser(ctx, target.ID, "spam", true, admin.ID)

	history, err := repo.GetBanHistory(ctx, target.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, history)
}

func TestPostgresUserRepository_ListUserIDsByRoles(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("listroles")
	_ = repo.UpdateRole(ctx, mod.ID, "moderator")

	ids, err := repo.ListUserIDsByRoles(ctx, []string{"moderator"})
	require.NoError(t, err)
	assert.Contains(t, ids, mod.ID)
}

func TestPostgresUserRepository_GetPublicKeysByIDs(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("pubkeys")
	_ = repo.UpdatePublicKey(ctx, user.ID, "testkey")

	keys, err := repo.GetPublicKeysByIDs(ctx, []int{user.ID})
	require.NoError(t, err)
	assert.Equal(t, "testkey", keys[user.ID])
}

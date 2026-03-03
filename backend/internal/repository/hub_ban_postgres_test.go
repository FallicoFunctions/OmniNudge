package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresHubBanRepository_BanUser(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubBanRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("ban_mod")
	target := fx.CreateUniqueUser("ban_target")
	hub := fx.CreateHub(fmt.Sprintf("ban_%d", time.Now().UnixNano()), mod.ID)

	ban, err := repo.BanUser(ctx, hub.ID, target.ID, mod.ID, "spam", "internal note", "permanent", nil)
	require.NoError(t, err)
	require.NotNil(t, ban)
	assert.Equal(t, target.ID, ban.UserID)
}

func TestPostgresHubBanRepository_IsUserBanned(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubBanRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("isbanned_mod")
	target := fx.CreateUniqueUser("isbanned_target")
	hub := fx.CreateHub(fmt.Sprintf("isbanned_%d", time.Now().UnixNano()), mod.ID)

	banned, err := repo.IsUserBanned(ctx, hub.ID, target.ID)
	require.NoError(t, err)
	assert.False(t, banned)

	_, _ = repo.BanUser(ctx, hub.ID, target.ID, mod.ID, "test", "", "permanent", nil)

	banned2, err := repo.IsUserBanned(ctx, hub.ID, target.ID)
	require.NoError(t, err)
	assert.True(t, banned2)
}

func TestPostgresHubBanRepository_UnbanUser(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubBanRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("unban_mod")
	target := fx.CreateUniqueUser("unban_target")
	hub := fx.CreateHub(fmt.Sprintf("unban_%d", time.Now().UnixNano()), mod.ID)

	_, _ = repo.BanUser(ctx, hub.ID, target.ID, mod.ID, "test", "", "permanent", nil)

	err := repo.UnbanUser(ctx, hub.ID, target.ID)
	require.NoError(t, err)

	banned, err := repo.IsUserBanned(ctx, hub.ID, target.ID)
	require.NoError(t, err)
	assert.False(t, banned)
}

func TestPostgresHubBanRepository_GetBannedUsers(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubBanRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("banlist_mod")
	t1 := fx.CreateUniqueUser("banlist_t1")
	t2 := fx.CreateUniqueUser("banlist_t2")
	hub := fx.CreateHub(fmt.Sprintf("banlist_%d", time.Now().UnixNano()), mod.ID)

	_, _ = repo.BanUser(ctx, hub.ID, t1.ID, mod.ID, "r1", "", "permanent", nil)
	_, _ = repo.BanUser(ctx, hub.ID, t2.ID, mod.ID, "r2", "", "permanent", nil)

	bans, err := repo.GetBannedUsers(ctx, hub.ID)
	require.NoError(t, err)
	assert.Len(t, bans, 2)
}

func TestPostgresHubBanRepository_CleanExpiredBans(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubBanRepository(db.Pool)
	ctx := context.Background()

	// Just verify the method runs without error.
	deleted, err := repo.CleanExpiredBans(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, deleted, int64(0))
}

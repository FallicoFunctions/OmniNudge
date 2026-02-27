package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFeatureFlagRepository_CreateAndGet(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewFeatureFlagRepository(db.Pool)
	ctx := context.Background()

	key := fmt.Sprintf("test_flag_%d", time.Now().UnixNano())
	flag := &models.FeatureFlag{
		Key:         key,
		Enabled:     true,
		Environment: "test",
		Description: "A test flag",
	}

	err := repo.CreateFlag(ctx, flag)
	require.NoError(t, err)

	got, err := repo.GetFlag(ctx, key)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, key, got.Key)
	assert.True(t, got.Enabled)
}

func TestFeatureFlagRepository_ListFlags(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewFeatureFlagRepository(db.Pool)
	ctx := context.Background()

	key := fmt.Sprintf("list_flag_%d", time.Now().UnixNano())
	_ = repo.CreateFlag(ctx, &models.FeatureFlag{
		Key: key, Enabled: true, Environment: "test", Description: "list test",
	})

	flags, err := repo.ListFlags(ctx, "test")
	require.NoError(t, err)

	keys := make([]string, len(flags))
	for i, f := range flags {
		keys[i] = f.Key
	}
	assert.Contains(t, keys, key)
}

func TestFeatureFlagRepository_UpdateFlag(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewFeatureFlagRepository(db.Pool)
	ctx := context.Background()

	key := fmt.Sprintf("update_flag_%d", time.Now().UnixNano())
	flag := &models.FeatureFlag{Key: key, Enabled: true, Environment: "test", Description: "before"}
	_ = repo.CreateFlag(ctx, flag)

	flag.Enabled = false
	flag.Description = "after"
	err := repo.UpdateFlag(ctx, flag)
	require.NoError(t, err)

	got, err := repo.GetFlag(ctx, key)
	require.NoError(t, err)
	assert.False(t, got.Enabled)
}

func TestFeatureFlagRepository_DeleteFlag(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewFeatureFlagRepository(db.Pool)
	ctx := context.Background()

	key := fmt.Sprintf("del_flag_%d", time.Now().UnixNano())
	_ = repo.CreateFlag(ctx, &models.FeatureFlag{Key: key, Enabled: true, Environment: "test", Description: "del"})

	err := repo.DeleteFlag(ctx, key)
	require.NoError(t, err)

	got, err2 := repo.GetFlag(ctx, key)
	require.NoError(t, err2)
	assert.Nil(t, got)
}

func TestFeatureFlagRepository_UserOverride(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewFeatureFlagRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ff_override_u")
	key := fmt.Sprintf("override_flag_%d", time.Now().UnixNano())
	_ = repo.CreateFlag(ctx, &models.FeatureFlag{Key: key, Enabled: false, Environment: "test", Description: "override"})

	userID := int64(user.ID)

	override, err := repo.GetUserOverride(ctx, key, userID)
	require.NoError(t, err)
	assert.Nil(t, override)

	err = repo.SetUserOverride(ctx, key, userID, true)
	require.NoError(t, err)

	override2, err := repo.GetUserOverride(ctx, key, userID)
	require.NoError(t, err)
	require.NotNil(t, override2)
	assert.True(t, *override2)

	err = repo.RemoveUserOverride(ctx, key, userID)
	require.NoError(t, err)

	override3, err := repo.GetUserOverride(ctx, key, userID)
	require.NoError(t, err)
	assert.Nil(t, override3)
}

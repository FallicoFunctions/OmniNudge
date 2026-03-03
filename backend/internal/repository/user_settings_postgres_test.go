package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresUserSettingsRepository_CreateDefaultAndGet(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserSettingsRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("uset_u")

	settings, err := repo.CreateDefault(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, settings)
	assert.Equal(t, user.ID, settings.UserID)

	got, err := repo.GetByUserID(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, user.ID, got.UserID)
}

func TestPostgresUserSettingsRepository_GetByUserID_NonExistent(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserSettingsRepository(db.Pool)
	ctx := context.Background()

	got, err := repo.GetByUserID(ctx, 999999)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestPostgresUserSettingsRepository_Update(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserSettingsRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("uset_update_u")
	settings, _ := repo.CreateDefault(ctx, user.ID)

	settings.NotificationSound = false
	updated, err := repo.Update(ctx, settings)
	require.NoError(t, err)
	require.NotNil(t, updated)
	assert.False(t, updated.NotificationSound)
}

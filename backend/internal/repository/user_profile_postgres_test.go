package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresUserProfileRepository_UpsertAndGet(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserProfileRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("uprof_u")
	bio := "Hello world"
	avatar := "https://example.com/avatar.png"
	status := "online"

	err := repo.Upsert(ctx, user.ID, &bio, &avatar, &status)
	require.NoError(t, err)

	got, err := repo.GetByUserID(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.NotNil(t, got.Bio)
	assert.Equal(t, bio, *got.Bio)
}

func TestPostgresUserProfileRepository_GetByUserID_NonExistent(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserProfileRepository(db.Pool)
	ctx := context.Background()

	got, err := repo.GetByUserID(ctx, 999999)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestPostgresUserProfileRepository_Upsert_UpdatesExisting(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserProfileRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("uprof_update_u")
	bio1 := "First bio"
	_ = repo.Upsert(ctx, user.ID, &bio1, nil, nil)

	bio2 := "Updated bio"
	err := repo.Upsert(ctx, user.ID, &bio2, nil, nil)
	require.NoError(t, err)

	got, err := repo.GetByUserID(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, got.Bio)
	assert.Equal(t, bio2, *got.Bio)
}

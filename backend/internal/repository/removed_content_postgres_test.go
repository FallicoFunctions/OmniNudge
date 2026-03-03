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

func TestPostgresRemovedContentRepository_RemoveAndRestore(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRemovedContentRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("rc_mod")
	hub := fx.CreateHub(fmt.Sprintf("rc_%d", time.Now().UnixNano()), mod.ID)

	rc, err := repo.RemoveContent(ctx, "post", 42, &hub.ID, mod.ID, nil, "spam", "internal")
	require.NoError(t, err)
	require.NotNil(t, rc)

	removed, err := repo.IsContentRemoved(ctx, "post", 42)
	require.NoError(t, err)
	assert.True(t, removed)

	err = repo.RestoreContent(ctx, "post", 42)
	require.NoError(t, err)

	removed2, err := repo.IsContentRemoved(ctx, "post", 42)
	require.NoError(t, err)
	assert.False(t, removed2)
}

func TestPostgresRemovedContentRepository_GetByContent(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRemovedContentRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("rc_byc_mod")
	hub := fx.CreateHub(fmt.Sprintf("rc_byc_%d", time.Now().UnixNano()), mod.ID)

	_, _ = repo.RemoveContent(ctx, "comment", 99, &hub.ID, mod.ID, nil, "spam", "")

	got, err := repo.GetByContent(ctx, "comment", 99)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "comment", got.ContentType)

	_ = repo.RestoreContent(ctx, "comment", 99)
}

func TestPostgresRemovedContentRepository_IsContentRemoved_NonExistent(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRemovedContentRepository(db.Pool)
	ctx := context.Background()

	removed, err := repo.IsContentRemoved(ctx, "post", 999999)
	require.NoError(t, err)
	assert.False(t, removed)
}

func TestPostgresRemovedContentRepository_GetByHub(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRemovedContentRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("rc_hub_mod")
	hub := fx.CreateHub(fmt.Sprintf("rc_hub_%d", time.Now().UnixNano()), mod.ID)

	_, _ = repo.RemoveContent(ctx, "post", 101, &hub.ID, mod.ID, nil, "spam", "")

	items, err := repo.GetByHub(ctx, hub.ID, 10, 0)
	require.NoError(t, err)
	assert.NotEmpty(t, items)

	_ = repo.RestoreContent(ctx, "post", 101)
}

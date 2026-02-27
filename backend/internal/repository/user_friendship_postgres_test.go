package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresUserFriendshipRepository_UpsertAndCheck(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserFriendshipRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("uf_u1")
	u2 := fx.CreateUniqueUser("uf_u2")

	friends, err := repo.AreUsersFriends(ctx, u1.ID, u2.ID)
	require.NoError(t, err)
	assert.False(t, friends)

	err = repo.UpsertAccepted(ctx, u1.ID, u2.ID)
	require.NoError(t, err)

	friends2, err := repo.AreUsersFriends(ctx, u1.ID, u2.ID)
	require.NoError(t, err)
	assert.True(t, friends2)
}

func TestPostgresUserFriendshipRepository_AreUsersFriends_Symmetric(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserFriendshipRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("uf_sym_u1")
	u2 := fx.CreateUniqueUser("uf_sym_u2")

	_ = repo.UpsertAccepted(ctx, u1.ID, u2.ID)

	// Friendship should be symmetric.
	friends, err := repo.AreUsersFriends(ctx, u2.ID, u1.ID)
	require.NoError(t, err)
	assert.True(t, friends)
}

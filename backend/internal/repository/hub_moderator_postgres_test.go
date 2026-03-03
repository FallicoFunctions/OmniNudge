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

func TestPostgresHubModeratorRepository_AddAndRemove(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubModeratorRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("mod_owner")
	mod := fx.CreateUniqueUser("mod_user")
	hub := fx.CreateHub(fmt.Sprintf("modtest_%d", time.Now().UnixNano()), owner.ID)

	err := repo.AddModerator(ctx, hub.ID, mod.ID)
	require.NoError(t, err)

	isMod, err := repo.IsModerator(ctx, hub.ID, mod.ID)
	require.NoError(t, err)
	assert.True(t, isMod)

	err = repo.RemoveModerator(ctx, hub.ID, mod.ID)
	require.NoError(t, err)

	isMod2, err := repo.IsModerator(ctx, hub.ID, mod.ID)
	require.NoError(t, err)
	assert.False(t, isMod2)
}

func TestPostgresHubModeratorRepository_IsModerator_NonExistent(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubModeratorRepository(db.Pool)
	ctx := context.Background()

	isMod, err := repo.IsModerator(ctx, 999999, 999999)
	require.NoError(t, err)
	assert.False(t, isMod)
}

func TestPostgresHubModeratorRepository_GetModeratorsForHub(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubModeratorRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("modlist_owner")
	mod1 := fx.CreateUniqueUser("modlist_m1")
	mod2 := fx.CreateUniqueUser("modlist_m2")
	hub := fx.CreateHub(fmt.Sprintf("modlist_%d", time.Now().UnixNano()), owner.ID)

	_ = repo.AddModerator(ctx, hub.ID, mod1.ID)
	_ = repo.AddModerator(ctx, hub.ID, mod2.ID)

	mods, err := repo.GetModeratorsForHub(ctx, hub.ID)
	require.NoError(t, err)
	assert.Len(t, mods, 2)
}

func TestPostgresHubModeratorRepository_GetHubsForModerator(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubModeratorRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("modhubs_owner")
	mod := fx.CreateUniqueUser("modhubs_mod")
	hub := fx.CreateHub(fmt.Sprintf("modhubs_%d", time.Now().UnixNano()), owner.ID)

	_ = repo.AddModerator(ctx, hub.ID, mod.ID)

	hubs, err := repo.GetHubsForModerator(ctx, mod.ID)
	require.NoError(t, err)
	ids := make([]int, len(hubs))
	for i, h := range hubs {
		ids[i] = h.HubID
	}
	assert.Contains(t, ids, hub.ID)
}

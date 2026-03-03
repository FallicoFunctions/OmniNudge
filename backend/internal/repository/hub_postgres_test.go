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

func TestPostgresHubRepository_Create(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("hub_create_u")
	name := fmt.Sprintf("testhub_%d", time.Now().UnixNano())

	hub := &domain.Hub{
		Name:      name,
		CreatedBy: &user.ID,
	}

	err := repo.Create(ctx, hub)
	require.NoError(t, err)
	assert.NotZero(t, hub.ID)
}

func TestPostgresHubRepository_GetByName(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("hub_byname_u")
	hub := fx.CreateHub(fmt.Sprintf("byname_%d", time.Now().UnixNano()), user.ID)

	tests := []struct {
		name    string
		query   string
		wantNil bool
	}{
		{"existing hub", hub.Name, false},
		{"non-existent hub", "no_such_hub_xyz_999", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByName(ctx, tc.query)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NotNil(t, got)
				assert.Equal(t, hub.ID, got.ID)
			}
		})
	}
}

func TestPostgresHubRepository_GetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("hub_byid_u")
	hub := fx.CreateHub(fmt.Sprintf("byid_%d", time.Now().UnixNano()), user.ID)

	tests := []struct {
		name    string
		id      int
		wantNil bool
	}{
		{"existing hub", hub.ID, false},
		{"non-existent hub", 999999, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByID(ctx, tc.id)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NotNil(t, got)
				assert.Equal(t, hub.ID, got.ID)
			}
		})
	}
}

func TestPostgresHubRepository_List(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("hub_list_u")
	hub := fx.CreateHub(fmt.Sprintf("list_%d", time.Now().UnixNano()), user.ID)

	hubs, err := repo.List(ctx, 100, 0, true)
	require.NoError(t, err)

	ids := make([]int, len(hubs))
	for i, h := range hubs {
		ids[i] = h.ID
	}
	assert.Contains(t, ids, hub.ID)
}

func TestPostgresHubRepository_ListByPrefix(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("hub_prefix_u")
	unique := fmt.Sprintf("pfx%d", time.Now().UnixNano())
	hub := fx.CreateHub(unique+"_hub", user.ID)

	hubs, err := repo.ListByPrefix(ctx, unique, 10, 0, true)
	require.NoError(t, err)

	ids := make([]int, len(hubs))
	for i, h := range hubs {
		ids[i] = h.ID
	}
	assert.Contains(t, ids, hub.ID)
}

func TestPostgresHubRepository_SearchHubs(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("hub_search_u")
	unique := fmt.Sprintf("srch%d", time.Now().UnixNano())
	hub := fx.CreateHub(unique+"_hub", user.ID)

	hubs, err := repo.SearchHubs(ctx, unique, 10)
	require.NoError(t, err)

	ids := make([]int, len(hubs))
	for i, h := range hubs {
		ids[i] = h.ID
	}
	assert.Contains(t, ids, hub.ID)
}

func TestPostgresHubRepository_UpdateNSFW(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("hub_nsfw_u")
	hub := fx.CreateHub(fmt.Sprintf("nsfw_%d", time.Now().UnixNano()), user.ID)

	err := repo.UpdateNSFW(ctx, hub.ID, true)
	require.NoError(t, err)

	got, err := repo.GetByID(ctx, hub.ID)
	require.NoError(t, err)
	assert.True(t, got.NSFW)
}

func TestPostgresHubRepository_GetPopularHubs(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubRepository(db.Pool)
	ctx := context.Background()

	hubs, err := repo.GetPopularHubs(ctx, 10, 0)
	require.NoError(t, err)
	// Just verify it returns without error (may be empty in test DB).
	_ = hubs
}

func TestPostgresHubRepository_GetTrendingHubs(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubRepository(db.Pool)
	ctx := context.Background()

	hubs, err := repo.GetTrendingHubs(ctx, 10)
	require.NoError(t, err)
	_ = hubs
}

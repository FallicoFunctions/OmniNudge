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

func TestPostgresRemovalReasonRepository_Create(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRemovalReasonRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("rr_create_mod")
	hub := fx.CreateHub(fmt.Sprintf("rr_create_%d", time.Now().UnixNano()), mod.ID)

	rr, err := repo.Create(ctx, hub.ID, mod.ID, "Spam", "This is spam.")
	require.NoError(t, err)
	require.NotNil(t, rr)
	assert.NotZero(t, rr.ID)
	assert.Equal(t, "Spam", rr.Title)
}

func TestPostgresRemovalReasonRepository_GetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRemovalReasonRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("rr_byid_mod")
	hub := fx.CreateHub(fmt.Sprintf("rr_byid_%d", time.Now().UnixNano()), mod.ID)
	rr, _ := repo.Create(ctx, hub.ID, mod.ID, "Spam", "desc")

	tests := []struct {
		name    string
		id      int
		wantNil bool
	}{
		{"existing", rr.ID, false},
		{"non-existent", 999999, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByID(ctx, tc.id)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NotNil(t, got)
				assert.Equal(t, rr.ID, got.ID)
			}
		})
	}
}

func TestPostgresRemovalReasonRepository_GetByHub(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRemovalReasonRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("rr_list_mod")
	hub := fx.CreateHub(fmt.Sprintf("rr_list_%d", time.Now().UnixNano()), mod.ID)
	rr, _ := repo.Create(ctx, hub.ID, mod.ID, "Off-topic", "desc")

	reasons, err := repo.GetByHub(ctx, hub.ID)
	require.NoError(t, err)

	ids := make([]int, len(reasons))
	for i, r := range reasons {
		ids[i] = r.ID
	}
	assert.Contains(t, ids, rr.ID)
}

func TestPostgresRemovalReasonRepository_Update(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRemovalReasonRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("rr_update_mod")
	hub := fx.CreateHub(fmt.Sprintf("rr_update_%d", time.Now().UnixNano()), mod.ID)
	rr, _ := repo.Create(ctx, hub.ID, mod.ID, "Old Title", "old desc")

	updated, err := repo.Update(ctx, rr.ID, "New Title", "new desc")
	require.NoError(t, err)
	require.NotNil(t, updated)
	assert.Equal(t, "New Title", updated.Title)
}

func TestPostgresRemovalReasonRepository_Delete(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRemovalReasonRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("rr_del_mod")
	hub := fx.CreateHub(fmt.Sprintf("rr_del_%d", time.Now().UnixNano()), mod.ID)
	rr, _ := repo.Create(ctx, hub.ID, mod.ID, "Delete me", "desc")

	err := repo.Delete(ctx, rr.ID)
	require.NoError(t, err)

	got, err := repo.GetByID(ctx, rr.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}

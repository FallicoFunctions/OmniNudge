package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresConversationRepository_Create(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresConversationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("conv_u1")
	u2 := fx.CreateUniqueUser("conv_u2")

	conv, err := repo.Create(ctx, u1.ID, u2.ID)
	require.NoError(t, err)
	require.NotNil(t, conv)
	assert.NotZero(t, conv.ID)
	assert.Equal(t, "dm", conv.ConversationType)
}

func TestPostgresConversationRepository_GetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresConversationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("cbyid_u1")
	u2 := fx.CreateUniqueUser("cbyid_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	tests := []struct {
		name    string
		id      int
		wantNil bool
	}{
		{"existing conversation", conv.ID, false},
		{"non-existent conversation", 999999, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByID(ctx, tc.id)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NotNil(t, got)
				assert.Equal(t, conv.ID, got.ID)
			}
		})
	}
}

func TestPostgresConversationRepository_GetByUsers(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresConversationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("cbu_u1")
	u2 := fx.CreateUniqueUser("cbu_u2")
	u3 := fx.CreateUniqueUser("cbu_u3")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	tests := []struct {
		name    string
		u1, u2  int
		wantNil bool
	}{
		{"existing pair", u1.ID, u2.ID, false},
		{"reversed pair", u2.ID, u1.ID, false},
		{"unrelated pair", u1.ID, u3.ID, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByUsers(ctx, tc.u1, tc.u2)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NotNil(t, got)
				assert.Equal(t, conv.ID, got.ID)
			}
		})
	}
}

func TestPostgresConversationRepository_GetByUserID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresConversationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("cbuid_u1")
	u2 := fx.CreateUniqueUser("cbuid_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	convs, err := repo.GetByUserID(ctx, u1.ID, 10, 0, false)
	require.NoError(t, err)
	ids := make([]int, len(convs))
	for i, c := range convs {
		ids[i] = c.ID
	}
	assert.Contains(t, ids, conv.ID)
}

func TestPostgresConversationRepository_Archive(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresConversationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("arch_u1")
	u2 := fx.CreateUniqueUser("arch_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	err := repo.Archive(ctx, conv.ID, u1.ID)
	require.NoError(t, err)

	// After archive, the conversation should not appear in normal listing.
	convs, err := repo.GetByUserID(ctx, u1.ID, 10, 0, false)
	require.NoError(t, err)
	ids := make([]int, len(convs))
	for i, c := range convs {
		ids[i] = c.ID
	}
	assert.NotContains(t, ids, conv.ID)

	// But it should appear in archived listing.
	archived, err := repo.GetArchivedByUserID(ctx, u1.ID, 10, 0)
	require.NoError(t, err)
	archIDs := make([]int, len(archived))
	for i, c := range archived {
		archIDs[i] = c.ID
	}
	assert.Contains(t, archIDs, conv.ID)
}

func TestPostgresConversationRepository_Unarchive(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresConversationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("unarch_u1")
	u2 := fx.CreateUniqueUser("unarch_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	_ = repo.Archive(ctx, conv.ID, u1.ID)
	err := repo.Unarchive(ctx, conv.ID, u1.ID)
	require.NoError(t, err)

	convs, err := repo.GetByUserID(ctx, u1.ID, 10, 0, false)
	require.NoError(t, err)
	ids := make([]int, len(convs))
	for i, c := range convs {
		ids[i] = c.ID
	}
	assert.Contains(t, ids, conv.ID)
}

func TestPostgresConversationRepository_SetMuted(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresConversationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("mute_u1")
	u2 := fx.CreateUniqueUser("mute_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	err := repo.SetMuted(ctx, conv.ID, u1.ID, true)
	assert.NoError(t, err)

	err = repo.SetMuted(ctx, conv.ID, u1.ID, false)
	assert.NoError(t, err)
}

func TestPostgresConversationRepository_SoftDeleteForUser(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresConversationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("sdel_u1")
	u2 := fx.CreateUniqueUser("sdel_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	err := repo.SoftDeleteForUser(ctx, conv.ID, u1.ID)
	assert.NoError(t, err)
}

func TestPostgresConversationRepository_Delete(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresConversationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("del_u1")
	u2 := fx.CreateUniqueUser("del_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	err := repo.Delete(ctx, conv.ID)
	require.NoError(t, err)

	got, err := repo.GetByID(ctx, conv.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}

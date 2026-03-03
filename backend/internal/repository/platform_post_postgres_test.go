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

func platformPost(ownerID, hubID int) *domain.PlatformPost {
	h := hubID
	return &domain.PlatformPost{
		AuthorID: ownerID,
		HubID:    &h,
		Title:    fmt.Sprintf("Post_%d", time.Now().UnixNano()),
	}
}

func TestPostgresPlatformPostRepository_CreateAndGetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPlatformPostRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	author := fx.CreateUniqueUser("pp_create_u")
	hub := fx.CreateHub(fmt.Sprintf("pp_hub_%d", time.Now().UnixNano()), author.ID)

	post := platformPost(author.ID, hub.ID)
	err := repo.Create(ctx, post)
	require.NoError(t, err)
	assert.NotZero(t, post.ID)

	got, err := repo.GetByID(ctx, post.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, post.ID, got.ID)
}

func TestPostgresPlatformPostRepository_GetByHub(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPlatformPostRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	author := fx.CreateUniqueUser("pp_hub_u")
	hub := fx.CreateHub(fmt.Sprintf("pp_hub2_%d", time.Now().UnixNano()), author.ID)

	post := platformPost(author.ID, hub.ID)
	_ = repo.Create(ctx, post)

	posts, err := repo.GetByHub(ctx, hub.ID, "new", 10, 0)
	require.NoError(t, err)

	ids := make([]int, len(posts))
	for i, p := range posts {
		ids[i] = p.ID
	}
	assert.Contains(t, ids, post.ID)
}

func TestPostgresPlatformPostRepository_GetByAuthor(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPlatformPostRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	author := fx.CreateUniqueUser("pp_author_u")
	hub := fx.CreateHub(fmt.Sprintf("pp_auth_hub_%d", time.Now().UnixNano()), author.ID)

	post := platformPost(author.ID, hub.ID)
	_ = repo.Create(ctx, post)

	posts, err := repo.GetByAuthor(ctx, author.ID, 10, 0)
	require.NoError(t, err)

	ids := make([]int, len(posts))
	for i, p := range posts {
		ids[i] = p.ID
	}
	assert.Contains(t, ids, post.ID)
}

func TestPostgresPlatformPostRepository_IncrementViewCount(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPlatformPostRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	author := fx.CreateUniqueUser("pp_view_u")
	hub := fx.CreateHub(fmt.Sprintf("pp_view_hub_%d", time.Now().UnixNano()), author.ID)

	post := platformPost(author.ID, hub.ID)
	_ = repo.Create(ctx, post)

	err := repo.IncrementViewCount(ctx, post.ID)
	require.NoError(t, err)
}

func TestPostgresPlatformPostRepository_SoftDelete(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPlatformPostRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	author := fx.CreateUniqueUser("pp_del_u")
	hub := fx.CreateHub(fmt.Sprintf("pp_del_hub_%d", time.Now().UnixNano()), author.ID)

	post := platformPost(author.ID, hub.ID)
	_ = repo.Create(ctx, post)

	err := repo.SoftDelete(ctx, post.ID)
	require.NoError(t, err)
}

func TestPostgresPlatformPostRepository_LockAndUnlock(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPlatformPostRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	author := fx.CreateUniqueUser("pp_lock_u")
	hub := fx.CreateHub(fmt.Sprintf("pp_lock_hub_%d", time.Now().UnixNano()), author.ID)

	post := platformPost(author.ID, hub.ID)
	_ = repo.Create(ctx, post)

	err := repo.LockPost(ctx, post.ID)
	require.NoError(t, err)

	err = repo.UnlockPost(ctx, post.ID)
	require.NoError(t, err)
}

func TestPostgresPlatformPostRepository_PinAndUnpin(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPlatformPostRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	author := fx.CreateUniqueUser("pp_pin_u")
	hub := fx.CreateHub(fmt.Sprintf("pp_pin_hub_%d", time.Now().UnixNano()), author.ID)

	post := platformPost(author.ID, hub.ID)
	_ = repo.Create(ctx, post)

	err := repo.PinPost(ctx, post.ID)
	require.NoError(t, err)

	ids, err := repo.GetPinnedIDsByHub(ctx, hub.ID)
	require.NoError(t, err)
	assert.Contains(t, ids, post.ID)

	err = repo.UnpinPost(ctx, post.ID)
	require.NoError(t, err)
}

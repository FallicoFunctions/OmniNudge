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

func TestPostgresSavedItemsRepository_SaveAndRemovePost(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresSavedItemsRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("si_post_u")
	author := fx.CreateUniqueUser("si_post_author")
	hub := fx.CreateHub(fmt.Sprintf("si_post_hub_%d", time.Now().UnixNano()), author.ID)
	post := createPost(t, db, author.ID, hub.ID)

	err := repo.SavePost(ctx, user.ID, post.ID)
	require.NoError(t, err)

	saved, err := repo.IsPostSaved(ctx, user.ID, post.ID)
	require.NoError(t, err)
	assert.True(t, saved)

	err = repo.RemovePost(ctx, user.ID, post.ID)
	require.NoError(t, err)

	saved2, err := repo.IsPostSaved(ctx, user.ID, post.ID)
	require.NoError(t, err)
	assert.False(t, saved2)
}

func TestPostgresSavedItemsRepository_GetSavedPosts(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresSavedItemsRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("si_getposts_u")
	author := fx.CreateUniqueUser("si_getposts_author")
	hub := fx.CreateHub(fmt.Sprintf("si_getposts_hub_%d", time.Now().UnixNano()), author.ID)
	post := createPost(t, db, author.ID, hub.ID)

	_ = repo.SavePost(ctx, user.ID, post.ID)

	posts, err := repo.GetSavedPosts(ctx, user.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, posts)
}

func TestPostgresSavedItemsRepository_HideAndUnhidePost(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresSavedItemsRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("si_hide_u")
	author := fx.CreateUniqueUser("si_hide_author")
	hub := fx.CreateHub(fmt.Sprintf("si_hide_hub_%d", time.Now().UnixNano()), author.ID)
	post := createPost(t, db, author.ID, hub.ID)

	err := repo.HidePost(ctx, user.ID, post.ID)
	require.NoError(t, err)

	hidden, err := repo.IsPostHidden(ctx, user.ID, post.ID)
	require.NoError(t, err)
	assert.True(t, hidden)

	err = repo.UnhidePost(ctx, user.ID, post.ID)
	require.NoError(t, err)

	hidden2, err := repo.IsPostHidden(ctx, user.ID, post.ID)
	require.NoError(t, err)
	assert.False(t, hidden2)
}

func TestPostgresSavedItemsRepository_SaveRedditPost(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresSavedItemsRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("si_rpost_u")
	redditPostID := fmt.Sprintf("rp_%d", time.Now().UnixNano())

	post := &domain.RedditPostDetails{
		Subreddit:    "golang",
		RedditPostID: redditPostID,
		Title:        "Test Reddit Post",
		Author:       "testuser",
	}

	err := repo.SaveRedditPost(ctx, user.ID, post)
	require.NoError(t, err)

	saved, err := repo.IsRedditPostSaved(ctx, user.ID, "golang", redditPostID)
	require.NoError(t, err)
	assert.True(t, saved)

	err = repo.RemoveRedditPost(ctx, user.ID, "golang", redditPostID)
	require.NoError(t, err)

	saved2, err := repo.IsRedditPostSaved(ctx, user.ID, "golang", redditPostID)
	require.NoError(t, err)
	assert.False(t, saved2)
}

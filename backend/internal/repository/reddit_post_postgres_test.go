package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestPostgresRedditPostRepository_UpsertPosts(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRedditPostRepository(db.Pool)
	ctx := context.Background()

	author := "testuser"
	now := time.Now()
	posts := []*domain.CachedRedditPost{
		{
			RedditPostID: "test_post_1",
			Subreddit:    "golang",
			Title:        "Test Post",
			Author:       &author,
			Score:        100,
			CacheKey:     "golang:hot",
			CachedAt:     now,
			ExpiresAt:    now.Add(1 * time.Hour),
			CreatedUTC:   now,
		},
	}

	err := repo.UpsertPosts(ctx, posts)
	require.NoError(t, err)

	// Upsert again — idempotent.
	err = repo.UpsertPosts(ctx, posts)
	require.NoError(t, err)
}

func TestPostgresRedditPostRepository_UpsertPosts_Empty(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRedditPostRepository(db.Pool)
	ctx := context.Background()

	// Empty slice should be a no-op.
	err := repo.UpsertPosts(ctx, []*domain.CachedRedditPost{})
	require.NoError(t, err)
}

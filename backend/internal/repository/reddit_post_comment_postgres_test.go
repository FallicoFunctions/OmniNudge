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

func TestPostgresRedditPostCommentRepository_CreateAndGetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRedditPostCommentRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("rpc_u")
	subreddit := fmt.Sprintf("r_%d", time.Now().UnixNano())
	postID := fmt.Sprintf("post_%d", time.Now().UnixNano())

	comment := &domain.RedditPostComment{
		UserID:    user.ID,
		Subreddit: subreddit,
		RedditPostID: postID,
		Content:   "Test comment",
	}

	err := repo.Create(ctx, comment)
	require.NoError(t, err)
	assert.NotZero(t, comment.ID)

	got, err := repo.GetByID(ctx, comment.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, comment.ID, got.ID)
}

func TestPostgresRedditPostCommentRepository_GetByRedditPost(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRedditPostCommentRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("rpc_list_u")
	subreddit := fmt.Sprintf("r_%d", time.Now().UnixNano())
	postID := fmt.Sprintf("post_%d", time.Now().UnixNano())

	comment := &domain.RedditPostComment{
		UserID: user.ID, Subreddit: subreddit, RedditPostID: postID, Content: "hello",
	}
	_ = repo.Create(ctx, comment)

	comments, err := repo.GetByRedditPost(ctx, subreddit, postID)
	require.NoError(t, err)

	ids := make([]int, len(comments))
	for i, c := range comments {
		ids[i] = c.ID
	}
	assert.Contains(t, ids, comment.ID)
}

func TestPostgresRedditPostCommentRepository_Update(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRedditPostCommentRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("rpc_update_u")
	subreddit := fmt.Sprintf("r_%d", time.Now().UnixNano())
	postID := fmt.Sprintf("post_%d", time.Now().UnixNano())

	comment := &domain.RedditPostComment{
		UserID: user.ID, Subreddit: subreddit, RedditPostID: postID, Content: "original",
	}
	_ = repo.Create(ctx, comment)

	err := repo.Update(ctx, comment.ID, "updated content")
	require.NoError(t, err)
}

func TestPostgresRedditPostCommentRepository_Delete(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRedditPostCommentRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("rpc_del_u")
	subreddit := fmt.Sprintf("r_%d", time.Now().UnixNano())
	postID := fmt.Sprintf("post_%d", time.Now().UnixNano())

	comment := &domain.RedditPostComment{
		UserID: user.ID, Subreddit: subreddit, RedditPostID: postID, Content: "delete me",
	}
	_ = repo.Create(ctx, comment)

	err := repo.Delete(ctx, comment.ID)
	require.NoError(t, err)

	got, err2 := repo.GetByID(ctx, comment.ID)
	require.NoError(t, err2)
	assert.Nil(t, got)
}

func TestPostgresRedditPostCommentRepository_GetUserVoteAndSetVote(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresRedditPostCommentRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	author := fx.CreateUniqueUser("rpc_vote_author")
	voter := fx.CreateUniqueUser("rpc_vote_voter")
	subreddit := fmt.Sprintf("r_%d", time.Now().UnixNano())
	postID := fmt.Sprintf("post_%d", time.Now().UnixNano())

	comment := &domain.RedditPostComment{
		UserID: author.ID, Subreddit: subreddit, RedditPostID: postID, Content: "vote on me",
	}
	_ = repo.Create(ctx, comment)

	vote, err := repo.GetUserVote(ctx, comment.ID, voter.ID)
	require.NoError(t, err)
	assert.Equal(t, 0, vote) // No vote yet.

	err = repo.SetVote(ctx, comment.ID, voter.ID, 1)
	require.NoError(t, err)

	vote2, err := repo.GetUserVote(ctx, comment.ID, voter.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, vote2)
}

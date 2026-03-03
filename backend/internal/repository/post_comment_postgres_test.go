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

func createPost(t *testing.T, db *testutil.TestDatabase, authorID, hubID int) *domain.PlatformPost {
	t.Helper()
	repo := repository.NewPostgresPlatformPostRepository(db.Pool)
	h := hubID
	post := &domain.PlatformPost{
		AuthorID: authorID,
		HubID:    &h,
		Title:    fmt.Sprintf("Post_%d", time.Now().UnixNano()),
	}
	require.NoError(t, repo.Create(context.Background(), post))
	return post
}

func TestPostgresPostCommentRepository_CreateAndGetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPostCommentRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	author := fx.CreateUniqueUser("pc_u")
	hub := fx.CreateHub(fmt.Sprintf("pc_hub_%d", time.Now().UnixNano()), author.ID)
	post := createPost(t, db, author.ID, hub.ID)

	comment := &domain.PostComment{
		PostID: post.ID,
		UserID: author.ID,
		Body:   "first comment",
	}

	err := repo.Create(ctx, comment)
	require.NoError(t, err)
	assert.NotZero(t, comment.ID)

	got, err := repo.GetByID(ctx, comment.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, comment.ID, got.ID)
}

func TestPostgresPostCommentRepository_GetByPostID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPostCommentRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	author := fx.CreateUniqueUser("pc_list_u")
	hub := fx.CreateHub(fmt.Sprintf("pc_list_hub_%d", time.Now().UnixNano()), author.ID)
	post := createPost(t, db, author.ID, hub.ID)

	comment := &domain.PostComment{PostID: post.ID, UserID: author.ID, Body: "comment"}
	_ = repo.Create(ctx, comment)

	comments, err := repo.GetByPostID(ctx, post.ID, "new", 10, 0, nil)
	require.NoError(t, err)

	ids := make([]int, len(comments))
	for i, c := range comments {
		ids[i] = c.ID
	}
	assert.Contains(t, ids, comment.ID)
}

func TestPostgresPostCommentRepository_SoftDelete(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPostCommentRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	author := fx.CreateUniqueUser("pc_del_u")
	hub := fx.CreateHub(fmt.Sprintf("pc_del_hub_%d", time.Now().UnixNano()), author.ID)
	post := createPost(t, db, author.ID, hub.ID)

	comment := &domain.PostComment{PostID: post.ID, UserID: author.ID, Body: "delete me"}
	_ = repo.Create(ctx, comment)

	err := repo.SoftDelete(ctx, comment.ID)
	require.NoError(t, err)
}

func TestPostgresPostCommentRepository_GetReplyCount(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPostCommentRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	author := fx.CreateUniqueUser("pc_reply_u")
	hub := fx.CreateHub(fmt.Sprintf("pc_reply_hub_%d", time.Now().UnixNano()), author.ID)
	post := createPost(t, db, author.ID, hub.ID)

	parent := &domain.PostComment{PostID: post.ID, UserID: author.ID, Body: "parent"}
	_ = repo.Create(ctx, parent)

	reply := &domain.PostComment{PostID: post.ID, UserID: author.ID, Body: "reply", ParentCommentID: &parent.ID}
	_ = repo.Create(ctx, reply)

	count, err := repo.GetReplyCount(ctx, parent.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, count)
}

package integration

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestPostVoteLifecycle(t *testing.T) {
	db := getTestDB(t)
	defer db.Close()
	resetTables(t, db)

	userRepo := models.NewUserRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)

	user := createUser(t, userRepo, "alice", "user")

	hubID := 1 // default "general" seeded by migration
	post := &models.PlatformPost{
		AuthorID: user.ID,
		HubID:    &hubID,
		Title:    "hello",
	}
	require.NoError(t, postRepo.Create(context.Background(), post))

	// upvote
	up := true
	require.NoError(t, postRepo.Vote(context.Background(), post.ID, user.ID, &up))
	reloaded, err := postRepo.GetByID(context.Background(), post.ID)
	require.NoError(t, err)
	require.Equal(t, 1, reloaded.Upvotes)
	require.Equal(t, 0, reloaded.Downvotes)
	require.Equal(t, 1, reloaded.Score)

	// duplicate upvote (no change)
	require.NoError(t, postRepo.Vote(context.Background(), post.ID, user.ID, &up))
	reloaded, _ = postRepo.GetByID(context.Background(), post.ID)
	require.Equal(t, 1, reloaded.Upvotes)
	require.Equal(t, 0, reloaded.Downvotes)
	require.Equal(t, 1, reloaded.Score)

	// unvote
	require.NoError(t, postRepo.Vote(context.Background(), post.ID, user.ID, nil))
	reloaded, _ = postRepo.GetByID(context.Background(), post.ID)
	require.Equal(t, 0, reloaded.Upvotes)
	require.Equal(t, 0, reloaded.Downvotes)
	require.Equal(t, 0, reloaded.Score)

	// downvote
	down := false
	require.NoError(t, postRepo.Vote(context.Background(), post.ID, user.ID, &down))
	reloaded, _ = postRepo.GetByID(context.Background(), post.ID)
	require.Equal(t, 0, reloaded.Upvotes)
	require.Equal(t, 1, reloaded.Downvotes)
	require.Equal(t, -1, reloaded.Score)
}

func TestCommentVoteLifecycle(t *testing.T) {
	db := getTestDB(t)
	defer db.Close()
	resetTables(t, db)

	userRepo := models.NewUserRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	commentRepo := models.NewPostCommentRepository(db.Pool)

	user := createUser(t, userRepo, "bob", "user")

	hubID2 := 1
	post := &models.PlatformPost{
		AuthorID: user.ID,
		HubID:    &hubID2,
		Title:    "post",
	}
	require.NoError(t, postRepo.Create(context.Background(), post))

	comment := &models.PostComment{
		PostID: post.ID,
		UserID: user.ID,
		Body:   "hi",
	}
	require.NoError(t, commentRepo.Create(context.Background(), comment))

	up := true
	require.NoError(t, commentRepo.Vote(context.Background(), comment.ID, user.ID, &up))
	reloaded, err := commentRepo.GetByID(context.Background(), comment.ID)
	require.NoError(t, err)
	require.Equal(t, 1, reloaded.Upvotes)
	require.Equal(t, 0, reloaded.Downvotes)
	require.Equal(t, 1, reloaded.Score)

	// unvote
	require.NoError(t, commentRepo.Vote(context.Background(), comment.ID, user.ID, nil))
	reloaded, _ = commentRepo.GetByID(context.Background(), comment.ID)
	require.Equal(t, 0, reloaded.Upvotes)
	require.Equal(t, 0, reloaded.Downvotes)
	require.Equal(t, 0, reloaded.Score)

	down := false
	require.NoError(t, commentRepo.Vote(context.Background(), comment.ID, user.ID, &down))
	reloaded, _ = commentRepo.GetByID(context.Background(), comment.ID)
	require.Equal(t, 0, reloaded.Upvotes)
	require.Equal(t, 1, reloaded.Downvotes)
	require.Equal(t, -1, reloaded.Score)
}

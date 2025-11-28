package integration

import (
	"context"
	"os"
	"testing"

	"github.com/chatreddit/backend/internal/database"
	"github.com/chatreddit/backend/internal/models"
	"github.com/chatreddit/backend/internal/utils"
	"github.com/stretchr/testify/require"
)

// helper to get test DB or skip if env not set
func getTestDB(t *testing.T) *database.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration tests")
	}
	db, err := database.New(dsn)
	require.NoError(t, err)
	require.NoError(t, db.Migrate(context.Background()))
	return db
}

// truncate tables between tests
func resetTables(t *testing.T, db *database.DB) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(), `
		TRUNCATE TABLE post_votes, comment_votes, post_comments, platform_posts, users RESTART IDENTITY CASCADE;
		TRUNCATE TABLE subreddits RESTART IDENTITY CASCADE;
		INSERT INTO subreddits (name, description) VALUES ('general', 'Default community for all posts');
	`)
	require.NoError(t, err)
}

func createUser(t *testing.T, repo *models.UserRepository, username string) *models.User {
	t.Helper()
	hash, err := utils.HashPassword("password123")
	require.NoError(t, err)
	user := &models.User{
		Username:     username,
		PasswordHash: hash,
	}
	require.NoError(t, repo.Create(context.Background(), user))
	return user
}

func TestPostVoteLifecycle(t *testing.T) {
	db := getTestDB(t)
	defer db.Close()
	resetTables(t, db)

	userRepo := models.NewUserRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)

	user := createUser(t, userRepo, "alice")

	post := &models.PlatformPost{
		AuthorID:    user.ID,
		SubredditID: 1, // default "general" seeded by migration
		Title:       "hello",
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

	user := createUser(t, userRepo, "bob")

	post := &models.PlatformPost{
		AuthorID:    user.ID,
		SubredditID: 1,
		Title:       "post",
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

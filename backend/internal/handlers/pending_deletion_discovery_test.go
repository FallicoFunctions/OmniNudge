package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetComments_HidesPendingDeletionAuthors(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, db, user1ID, _, cleanup := setupCommentsHandlerTest(t)
	defer cleanup()

	post := createTestPost(t, db, user1ID)
	commentRepo := models.NewPostCommentRepository(db.Pool)
	userRepo := models.NewUserRepository(db.Pool)

	pendingUser := &models.User{Username: uniqueCommentsUsername("pending"), PasswordHash: "test_hash"}
	require.NoError(t, userRepo.Create(context.Background(), pendingUser))
	_, err := db.Pool.Exec(context.Background(), `
		UPDATE users
		SET deleted_at = NOW(), permanent_deletion_at = NOW() + INTERVAL '30 days'
		WHERE id = $1
	`, pendingUser.ID)
	require.NoError(t, err)

	comment := &models.PostComment{
		PostID: post.ID,
		UserID: pendingUser.ID,
		Body:   "hidden pending deletion comment",
	}
	require.NoError(t, commentRepo.Create(context.Background(), comment))

	router := gin.New()
	router.GET("/posts/:id/comments", handler.GetComments)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/posts/"+strconv.Itoa(post.ID)+"/comments", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	rawComments := resp["comments"]
	if rawComments != nil {
		comments, ok := rawComments.([]interface{})
		require.True(t, ok)
		assert.Len(t, comments, 0)
	}
}

func TestGetPlatformSubredditPosts_HidesPendingDeletionAuthors(t *testing.T) {
	_, pool, hubRepo, postRepo, userRepo, cleanup := setupHubsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	postsHandler := NewPostsHandler(pool, postRepo, hubRepo, userRepo, nil, nil, nil)
	router.GET("/subreddits/:name/posts", postsHandler.GetSubredditPosts)

	ctx := context.Background()
	pendingUser := &models.User{
		Username:     uniqueCommentsUsername("pending_subreddit"),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, pendingUser))
	_, err := pool.Exec(ctx, `
		UPDATE users
		SET deleted_at = NOW(), permanent_deletion_at = NOW() + INTERVAL '30 days'
		WHERE id = $1
	`, pendingUser.ID)
	require.NoError(t, err)

	body := "Body"
	post := &models.PlatformPost{
		AuthorID:        pendingUser.ID,
		Title:           "Hidden post",
		Body:            &body,
		TargetSubreddit: ptr("funny"),
	}
	require.NoError(t, postRepo.Create(ctx, post))

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/subreddits/funny/posts", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	posts, ok := response["posts"].([]interface{})
	require.True(t, ok)
	assert.Len(t, posts, 0)
}

func TestGetHomeFeed_HidesPendingDeletionAuthors(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, db, _, cleanup := setupFeedHandlerTest(t)
	defer cleanup()

	userRepo := models.NewUserRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)

	pendingUser := &models.User{Username: uniqueFeedUsername("pending"), PasswordHash: "test_hash"}
	require.NoError(t, userRepo.Create(context.Background(), pendingUser))
	_, err := db.Pool.Exec(context.Background(), `
		UPDATE users
		SET deleted_at = NOW(), permanent_deletion_at = NOW() + INTERVAL '30 days'
		WHERE id = $1
	`, pendingUser.ID)
	require.NoError(t, err)

	post := &models.PlatformPost{AuthorID: pendingUser.ID, Title: "Hidden feed post"}
	require.NoError(t, postRepo.Create(context.Background(), post))

	router := gin.New()
	router.GET("/feed", handler.GetHomeFeed)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/feed?omni_only=true", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp homeFeedResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Len(t, resp.Posts, 0)
}

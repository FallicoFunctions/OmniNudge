package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeRedditClient struct {
	posts map[string]*services.RedditPost
}

func (f *fakeRedditClient) GetPostInfo(ctx context.Context, subreddit string, redditPostID string) (*services.RedditPost, error) {
	if f.posts == nil {
		return nil, nil
	}
	if post, ok := f.posts[redditPostID]; ok {
		return post, nil
	}
	return nil, nil
}

// setupSavedItemsTest creates a test setup with database and handler
func setupSavedItemsTest(t *testing.T) (*SavedItemsHandler, *models.SavedItemsRepository, *models.PlatformPostRepository, *fakeRedditClient, int, int, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	// Create a test user
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     fmt.Sprintf("testuser_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, user)
	require.NoError(t, err)

	// Create a test hub (required for platform posts)
	hubRepo := models.NewHubRepository(db.Pool)
	hubDesc := "Test hub"
	hub := &models.Hub{
		Name:        fmt.Sprintf("testhub_%d", time.Now().UnixNano()),
		Description: &hubDesc,
		CreatedBy:   &user.ID,
	}
	err = hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	savedRepo := models.NewSavedItemsRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	commentRepo := models.NewPostCommentRepository(db.Pool)
	redditCommentRepo := models.NewRedditPostCommentRepository(db.Pool)
	redditClient := &fakeRedditClient{
		posts: make(map[string]*services.RedditPost),
	}

	handler := NewSavedItemsHandler(savedRepo, postRepo, commentRepo, redditCommentRepo, redditClient)

	cleanup := func() {
		db.Close()
	}

	return handler, savedRepo, postRepo, redditClient, user.ID, hub.ID, cleanup
}

// mockAuth middleware for testing
func mockAuthMiddleware(userID int) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("user_id", userID)
		c.Next()
	}
}

func TestGetSavedItems(t *testing.T) {
	handler, savedRepo, postRepo, _, userID, hubID, cleanup := setupSavedItemsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/saved", mockAuthMiddleware(userID), handler.GetSavedItems)

	ctx := context.Background()

	// Create a test post
	postBody := "Test body"
	post := &models.PlatformPost{
		AuthorID: userID,
		HubID:    &hubID,
		Title:    "Test Post",
		Body:     &postBody,
	}
	err := postRepo.Create(ctx, post)
	require.NoError(t, err)

	// Save the post
	err = savedRepo.SavePost(ctx, userID, post.ID)
	require.NoError(t, err)

	// Save a Reddit post
	redditPost := &models.RedditPostDetails{
		Subreddit:    "funny",
		RedditPostID: "abc123",
		Title:        "Test Reddit Post",
		Author:       "testuser",
		Score:        100,
		NumComments:  50,
	}
	err = savedRepo.SaveRedditPost(ctx, userID, redditPost)
	require.NoError(t, err)

	tests := []struct {
		name           string
		queryType      string
		expectedStatus int
		checkResponse  func(t *testing.T, body map[string]interface{})
	}{
		{
			name:           "get all saved items",
			queryType:      "all",
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, "all", body["type"])
				assert.NotNil(t, body["saved_posts"])
				assert.NotNil(t, body["saved_reddit_posts"])

				posts := body["saved_posts"].([]interface{})
				assert.Len(t, posts, 1)

				redditPosts := body["saved_reddit_posts"].([]interface{})
				assert.Len(t, redditPosts, 1)
			},
		},
		{
			name:           "get only platform posts",
			queryType:      "posts",
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, "posts", body["type"])
				assert.NotNil(t, body["saved_posts"])
				assert.Nil(t, body["saved_reddit_posts"])

				posts := body["saved_posts"].([]interface{})
				assert.Len(t, posts, 1)
			},
		},
		{
			name:           "get only reddit posts",
			queryType:      "reddit_posts",
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, "reddit_posts", body["type"])
				assert.Nil(t, body["saved_posts"])
				assert.NotNil(t, body["saved_reddit_posts"])

				redditPosts := body["saved_reddit_posts"].([]interface{})
				assert.Len(t, redditPosts, 1)
			},
		},
		{
			name:           "invalid type filter",
			queryType:      "invalid",
			expectedStatus: http.StatusBadRequest,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Contains(t, body["error"], "Invalid type filter")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("GET", fmt.Sprintf("/saved?type=%s", tt.queryType), nil)
			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			if tt.checkResponse != nil {
				tt.checkResponse(t, response)
			}
		})
	}
}

func TestGetSavedItems_RemovesModeratorDeletedRedditPosts(t *testing.T) {
	handler, savedRepo, _, redditClient, userID, _, cleanup := setupSavedItemsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/saved", mockAuthMiddleware(userID), handler.GetSavedItems)

	ctx := context.Background()
	err := savedRepo.SaveRedditPost(ctx, userID, &models.RedditPostDetails{
		Subreddit:    "funny",
		RedditPostID: "abc123",
		Title:        "Removed by moderator",
		Author:       "poster",
		Score:        10,
		NumComments:  5,
	})
	require.NoError(t, err)

	redditClient.posts["abc123"] = &services.RedditPost{
		ID:                "abc123",
		Subreddit:         "funny",
		Title:             "[ Removed by moderator ]",
		Author:            "poster",
		RemovedByCategory: "moderator",
	}

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/saved?type=reddit_posts", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "reddit_posts", response["type"])
	assert.NotNil(t, response["saved_reddit_posts"])
	redditPosts := response["saved_reddit_posts"].([]interface{})
	assert.Len(t, redditPosts, 0, "Removed posts should be pruned from response")

	autoRemoved, ok := response["auto_removed_reddit_posts"].([]interface{})
	require.True(t, ok)
	assert.Len(t, autoRemoved, 1)

	remaining, err := savedRepo.GetSavedRedditPosts(ctx, userID)
	require.NoError(t, err)
	assert.Len(t, remaining, 0, "Removed posts should be unsaved in storage")
}

func TestGetHiddenItems(t *testing.T) {
	handler, savedRepo, postRepo, _, userID, hubID, cleanup := setupSavedItemsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hidden", mockAuthMiddleware(userID), handler.GetHiddenItems)

	ctx := context.Background()

	// Create a test post
	postBody := "Test body"
	post := &models.PlatformPost{
		AuthorID: userID,
		HubID:    &hubID,
		Title:    "Test Post",
		Body:     &postBody,
	}
	err := postRepo.Create(ctx, post)
	require.NoError(t, err)

	// Hide the post
	err = savedRepo.HidePost(ctx, userID, post.ID)
	require.NoError(t, err)

	// Hide a Reddit post
	err = savedRepo.HideRedditPost(ctx, userID, "funny", "xyz789")
	require.NoError(t, err)

	tests := []struct {
		name           string
		queryType      string
		expectedStatus int
		checkResponse  func(t *testing.T, body map[string]interface{})
	}{
		{
			name:           "get all hidden items",
			queryType:      "all",
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, "all", body["type"])
				assert.NotNil(t, body["hidden_posts"])
				assert.NotNil(t, body["hidden_reddit_posts"])

				posts := body["hidden_posts"].([]interface{})
				assert.Len(t, posts, 1)

				redditPosts := body["hidden_reddit_posts"].([]interface{})
				assert.Len(t, redditPosts, 1)
			},
		},
		{
			name:           "get only hidden platform posts",
			queryType:      "posts",
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, "posts", body["type"])
				assert.NotNil(t, body["hidden_posts"])
				assert.Nil(t, body["hidden_reddit_posts"])
			},
		},
		{
			name:           "get only hidden reddit posts",
			queryType:      "reddit_posts",
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, "reddit_posts", body["type"])
				assert.Nil(t, body["hidden_posts"])
				assert.NotNil(t, body["hidden_reddit_posts"])
			},
		},
		{
			name:           "invalid type filter",
			queryType:      "invalid",
			expectedStatus: http.StatusBadRequest,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Contains(t, body["error"], "Invalid type filter")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("GET", fmt.Sprintf("/hidden?type=%s", tt.queryType), nil)
			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			if tt.checkResponse != nil {
				tt.checkResponse(t, response)
			}
		})
	}
}

func TestSavePost(t *testing.T) {
	handler, savedRepo, postRepo, _, userID, hubID, cleanup := setupSavedItemsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/posts/:id/save", mockAuthMiddleware(userID), handler.SavePost)

	ctx := context.Background()

	// Create a test post
	postBody := "Test body"
	post := &models.PlatformPost{
		AuthorID: 2, // Different user
		HubID:    &hubID,
		Title:    "Test Post",
		Body:     &postBody,
	}
	err := postRepo.Create(ctx, post)
	require.NoError(t, err)

	tests := []struct {
		name           string
		postID         string
		expectedStatus int
		checkResponse  func(t *testing.T, body map[string]interface{})
	}{
		{
			name:           "save post successfully",
			postID:         fmt.Sprintf("%d", post.ID),
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Equal(t, "Post saved successfully", body["message"])

				// Verify it was actually saved
				saved, err := savedRepo.IsPostSaved(ctx, userID, post.ID)
				require.NoError(t, err)
				assert.True(t, saved)
			},
		},
		{
			name:           "save same post again (idempotent)",
			postID:         fmt.Sprintf("%d", post.ID),
			expectedStatus: http.StatusConflict,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Contains(t, body["error"], "already saved")
			},
		},
		{
			name:           "save non-existent post",
			postID:         "99999",
			expectedStatus: http.StatusNotFound,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Contains(t, body["error"], "Post not found")
			},
		},
		{
			name:           "invalid post ID",
			postID:         "invalid",
			expectedStatus: http.StatusBadRequest,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Contains(t, body["error"], "Invalid post ID")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("POST", fmt.Sprintf("/posts/%s/save", tt.postID), nil)
			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			if tt.checkResponse != nil {
				tt.checkResponse(t, response)
			}
		})
	}
}

func TestUnsavePost(t *testing.T) {
	handler, savedRepo, postRepo, _, userID, hubID, cleanup := setupSavedItemsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.DELETE("/posts/:id/save", mockAuthMiddleware(userID), handler.UnsavePost)

	ctx := context.Background()

	// Create and save a test post
	postBody := "Test body"
	post := &models.PlatformPost{
		AuthorID: 2,
		HubID:    &hubID,
		Title:    "Test Post",
		Body:     &postBody,
	}
	err := postRepo.Create(ctx, post)
	require.NoError(t, err)

	err = savedRepo.SavePost(ctx, userID, post.ID)
	require.NoError(t, err)

	t.Run("unsave post successfully", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("DELETE", fmt.Sprintf("/posts/%d/save", post.ID), nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, "Post unsaved successfully", response["message"])

		// Verify it was actually unsaved
		saved, err := savedRepo.IsPostSaved(ctx, userID, post.ID)
		require.NoError(t, err)
		assert.False(t, saved)
	})

	t.Run("unsave post that wasn't saved", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("DELETE", fmt.Sprintf("/posts/%d/save", post.ID), nil)
		router.ServeHTTP(w, req)

		// Should still return 200 (idempotent)
		assert.Equal(t, http.StatusOK, w.Code)
	})
}

func TestSaveRedditPost(t *testing.T) {
	handler, savedRepo, _, _, userID, _, cleanup := setupSavedItemsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/reddit/posts/:subreddit/:postId/save", mockAuthMiddleware(userID), handler.SaveRedditPost)

	ctx := context.Background()

	requestBody := saveRedditPostRequest{
		Title:       "Funny cat video",
		Author:      "reddituser",
		Score:       5420,
		NumComments: 342,
	}
	bodyBytes, _ := json.Marshal(requestBody)

	t.Run("save reddit post successfully", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/reddit/posts/funny/abc123/save", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, true, response["saved"])

		// Verify it was actually saved
		saved, err := savedRepo.IsRedditPostSaved(ctx, userID, "funny", "abc123")
		require.NoError(t, err)
		assert.True(t, saved)
	})

	t.Run("save same reddit post again", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/reddit/posts/funny/abc123/save", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		// Saving again should succeed (it's idempotent)
		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, true, response["saved"])
	})

	t.Run("save reddit post with invalid JSON", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/reddit/posts/funny/def456/save", bytes.NewBufferString("invalid json"))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestHidePost(t *testing.T) {
	handler, savedRepo, postRepo, _, userID, hubID, cleanup := setupSavedItemsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/posts/:id/hide", mockAuthMiddleware(userID), handler.HidePost)

	ctx := context.Background()

	// Create a test post
	postBody := "Test body"
	post := &models.PlatformPost{
		AuthorID: 2,
		HubID:    &hubID,
		Title:    "Test Post",
		Body:     &postBody,
	}
	err := postRepo.Create(ctx, post)
	require.NoError(t, err)

	t.Run("hide post successfully", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", fmt.Sprintf("/posts/%d/hide", post.ID), nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, true, response["hidden"])

		// Verify it was actually hidden
		hidden, err := savedRepo.IsPostHidden(ctx, userID, post.ID)
		require.NoError(t, err)
		assert.True(t, hidden)
	})

	t.Run("hide same post again", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", fmt.Sprintf("/posts/%d/hide", post.ID), nil)
		router.ServeHTTP(w, req)

		// Hiding again should succeed (it's idempotent)
		assert.Equal(t, http.StatusOK, w.Code)
	})
}

func TestUnhidePost(t *testing.T) {
	handler, savedRepo, postRepo, _, userID, hubID, cleanup := setupSavedItemsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.DELETE("/posts/:id/hide", mockAuthMiddleware(userID), handler.UnhidePost)

	ctx := context.Background()

	// Create and hide a test post
	postBody := "Test body"
	post := &models.PlatformPost{
		AuthorID: 2,
		HubID:    &hubID,
		Title:    "Test Post",
		Body:     &postBody,
	}
	err := postRepo.Create(ctx, post)
	require.NoError(t, err)

	err = savedRepo.HidePost(ctx, userID, post.ID)
	require.NoError(t, err)

	t.Run("unhide post successfully", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("DELETE", fmt.Sprintf("/posts/%d/hide", post.ID), nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, false, response["hidden"])

		// Verify it was actually unhidden
		hidden, err := savedRepo.IsPostHidden(ctx, userID, post.ID)
		require.NoError(t, err)
		assert.False(t, hidden)
	})
}

func TestHideRedditPost(t *testing.T) {
	handler, savedRepo, _, _, userID, _, cleanup := setupSavedItemsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/reddit/posts/:subreddit/:postId/hide", mockAuthMiddleware(userID), handler.HideRedditPost)

	ctx := context.Background()

	t.Run("hide reddit post successfully", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/reddit/posts/funny/xyz789/hide", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, true, response["hidden"])

		// Verify it was actually hidden
		hidden, err := savedRepo.IsRedditPostHidden(ctx, userID, "funny", "xyz789")
		require.NoError(t, err)
		assert.True(t, hidden)
	})

	t.Run("hide same reddit post again", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/reddit/posts/funny/xyz789/hide", nil)
		router.ServeHTTP(w, req)

		// Hiding again should succeed (it's idempotent)
		assert.Equal(t, http.StatusOK, w.Code)
	})
}

func TestUnhideRedditPost(t *testing.T) {
	handler, savedRepo, _, _, userID, _, cleanup := setupSavedItemsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.DELETE("/reddit/posts/:subreddit/:postId/hide", mockAuthMiddleware(userID), handler.UnhideRedditPost)

	ctx := context.Background()

	// Hide a reddit post first
	err := savedRepo.HideRedditPost(ctx, userID, "funny", "xyz789")
	require.NoError(t, err)

	t.Run("unhide reddit post successfully", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("DELETE", "/reddit/posts/funny/xyz789/hide", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, false, response["hidden"])

		// Verify it was actually unhidden
		hidden, err := savedRepo.IsRedditPostHidden(ctx, userID, "funny", "xyz789")
		require.NoError(t, err)
		assert.False(t, hidden)
	})
}

func TestSavedItemsAuthRequired(t *testing.T) {
	handler, _, _, _, _, _, cleanup := setupSavedItemsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()

	// Routes without auth middleware
	router.GET("/saved", handler.GetSavedItems)
	router.GET("/hidden", handler.GetHiddenItems)
	router.POST("/posts/:id/save", handler.SavePost)

	tests := []struct {
		name   string
		method string
		path   string
	}{
		{"get saved items", "GET", "/saved"},
		{"get hidden items", "GET", "/hidden"},
		{"save post", "POST", "/posts/1/save"},
	}

	for _, tt := range tests {
		t.Run(tt.name+" requires auth", func(t *testing.T) {
			w := httptest.NewRecorder()
			req, _ := http.NewRequest(tt.method, tt.path, nil)
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusUnauthorized, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)
			assert.Contains(t, response["error"], "not authenticated")
		})
	}
}

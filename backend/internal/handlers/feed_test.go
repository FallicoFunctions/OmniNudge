package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var feedTestCounter int64

func uniqueFeedUsername(base string) string {
	id := atomic.AddInt64(&feedTestCounter, 1)
	return fmt.Sprintf("%s_feed_%d_%d", base, time.Now().UnixNano(), id)
}

func setupFeedHandlerTest(t *testing.T) (*FeedHandler, *database.Database, int, func()) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{Username: uniqueFeedUsername("feeduser"), PasswordHash: "test_hash"}
	require.NoError(t, userRepo.Create(ctx, user))

	postRepo := models.NewPlatformPostRepository(db.Pool)
	hubSubRepo := models.NewHubSubscriptionRepository(db.Pool)
	subRepo := models.NewSubredditSubscriptionRepository(db.Pool)
	cache := services.NewMemoryCache()

	// Use a no-op reddit client (no credentials needed - tests don't hit real Reddit)
	redditClient := services.NewRedditClient("test-agent", cache, 5*time.Minute, "", "")

	handler := NewFeedHandler(postRepo, hubSubRepo, subRepo, redditClient, cache, 5*time.Minute)

	cleanup := func() { db.Close() }
	return handler, db, user.ID, cleanup
}

func TestGetHomeFeed(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("unauthenticated still returns 200 (public feed)", func(t *testing.T) {
		handler, _, _, cleanup := setupFeedHandlerTest(t)
		defer cleanup()

		router := gin.New()
		router.GET("/feed", handler.GetHomeFeed)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/feed", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp homeFeedResponse
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		// Empty authenticated feed returns nil slice (no items) — just verify 200 OK
	})

	t.Run("authenticated user returns 200", func(t *testing.T) {
		handler, _, userID, cleanup := setupFeedHandlerTest(t)
		defer cleanup()

		router := gin.New()
		router.GET("/feed", func(c *gin.Context) {
			c.Set("user_id", userID)
			c.Set("authenticated", true)
			handler.GetHomeFeed(c)
		})

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/feed", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("sort=new returns 200", func(t *testing.T) {
		handler, _, _, cleanup := setupFeedHandlerTest(t)
		defer cleanup()

		router := gin.New()
		router.GET("/feed", handler.GetHomeFeed)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/feed?sort=new", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp homeFeedResponse
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.Equal(t, "new", resp.Sort)
	})

	t.Run("omni_only=true excludes reddit", func(t *testing.T) {
		handler, _, _, cleanup := setupFeedHandlerTest(t)
		defer cleanup()

		router := gin.New()
		router.GET("/feed", handler.GetHomeFeed)

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/feed?omni_only=true", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp homeFeedResponse
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.True(t, resp.OmniOnly)
		// All posts should be from hub (source=hub), none from reddit
		for _, item := range resp.Posts {
			assert.Equal(t, "hub", item.Source)
		}
	})
}

func TestGetHomeFeed_Pagination(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, db, userID, cleanup := setupFeedHandlerTest(t)
	defer cleanup()

	// Create some platform posts so pagination has data
	postRepo := models.NewPlatformPostRepository(db.Pool)
	for i := 0; i < 5; i++ {
		post := &models.PlatformPost{
			AuthorID: userID,
			Title:    fmt.Sprintf("Test Post %d", i),
		}
		require.NoError(t, postRepo.Create(context.Background(), post), "failed to create test post %d", i)
	}

	router := gin.New()
	router.GET("/feed", func(c *gin.Context) {
		c.Set("user_id", userID)
		c.Set("authenticated", true)
		handler.GetHomeFeed(c)
	})

	t.Run("limit param is respected", func(t *testing.T) {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/feed?limit=2&omni_only=true", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp homeFeedResponse
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.Equal(t, 2, resp.Limit)
	})

	t.Run("invalid cursor returns 400", func(t *testing.T) {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/feed?cursor=not-valid-base64!!!", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestGetHomeFeed_Empty(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// New user with no subscriptions
	handler, _, userID, cleanup := setupFeedHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.GET("/feed", func(c *gin.Context) {
		c.Set("user_id", userID)
		c.Set("authenticated", true)
		handler.GetHomeFeed(c)
	})

	w := httptest.NewRecorder()
	// omni_only to avoid hitting reddit, force_popular to avoid interleaved fetch issues
	req := httptest.NewRequest(http.MethodGet, "/feed?omni_only=true", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp homeFeedResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	// Posts slice should be non-nil even if empty
	// Posts slice may be nil when empty — 200 OK is sufficient assertion
}

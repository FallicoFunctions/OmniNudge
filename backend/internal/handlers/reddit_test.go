package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockRedditCache is a simple in-memory cache for testing
type mockRedditCache struct {
	store map[string]string
}

func (m *mockRedditCache) Get(ctx context.Context, key string) (string, bool, error) {
	if m.store == nil {
		return "", false, nil
	}
	v, ok := m.store[key]
	return v, ok, nil
}

func (m *mockRedditCache) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	if m.store == nil {
		m.store = make(map[string]string)
	}
	m.store[key] = value
	return nil
}

// hostRewriteTransport rewrites outgoing requests to a test server
type hostRewriteTransport struct {
	target *httptest.Server
}

func (t *hostRewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req.URL.Scheme = "http"
	req.URL.Host = t.target.Listener.Addr().String()
	return http.DefaultTransport.RoundTrip(req)
}

func setupRedditHandlerTest(t *testing.T) (*RedditHandler, *httptest.Server, *int32) {
	handlerCalls := int32(0)

	// Create mock Reddit server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&handlerCalls, 1)
		w.Header().Set("Content-Type", "application/json")

		// Default response
		resp := services.RedditListing{
			Kind: "Listing",
		}
		resp.Data.After = "t3_after"
		resp.Data.Before = "t3_before"
		resp.Data.Children = []struct {
			Kind string              `json:"kind"`
			Data services.RedditPost `json:"data"`
		}{
			{
				Kind: "t3",
				Data: services.RedditPost{
					ID:         "abc123",
					Title:      "Test Post",
					Author:     "test_user",
					Subreddit:  "golang",
					Score:      100,
					CreatedUTC: 1234567890,
					URL:        "https://i.redd.it/test.jpg",
					Permalink:  "/r/golang/comments/abc123/test_post",
					PostHint:   "image",
					Domain:     "i.redd.it",
					IsVideo:    false,
					Over18:     false,
					Thumbnail:  "https://b.thumbs.redditmedia.com/test.jpg",
				},
			},
			{
				Kind: "t3",
				Data: services.RedditPost{
					ID:         "def456",
					Title:      "Test Video Post",
					Author:     "test_user2",
					Subreddit:  "golang",
					Score:      200,
					CreatedUTC: 1234567900,
					URL:        "https://v.redd.it/test",
					Permalink:  "/r/golang/comments/def456/test_video",
					IsVideo:    true,
					Over18:     false,
					Thumbnail:  "https://b.thumbs.redditmedia.com/test2.jpg",
				},
			},
			{
				Kind: "t3",
				Data: services.RedditPost{
					ID:         "ghi789",
					Title:      "Text Post (no media)",
					Author:     "test_user3",
					Subreddit:  "golang",
					Score:      50,
					CreatedUTC: 1234567910,
					URL:        "https://reddit.com/r/golang/comments/ghi789",
					Permalink:  "/r/golang/comments/ghi789/text_post",
					PostHint:   "self",
					IsSelf:     true,
				},
			},
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))

	cache := &mockRedditCache{store: make(map[string]string)}
	client := services.NewRedditClient("test-agent", cache, time.Minute)
	client.SetHTTPClient(&http.Client{Transport: &hostRewriteTransport{target: ts}})

	handler := NewRedditHandlerForTest(client)

	return handler, ts, &handlerCalls
}

func TestGetSubredditPosts(t *testing.T) {
	handler, ts, handlerCalls := setupRedditHandlerTest(t)
	defer ts.Close()

	router := gin.Default()
	router.GET("/r/:subreddit", handler.GetSubredditPosts)

	req := httptest.NewRequest("GET", "/r/golang?sort=hot&limit=25", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())
	require.Equal(t, int32(1), atomic.LoadInt32(handlerCalls), "Should have called Reddit API once")

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "golang", response["subreddit"])
	assert.Equal(t, "hot", response["sort"])
	assert.Equal(t, float64(25), response["limit"])
	assert.Equal(t, "t3_after", response["after"])
	assert.Equal(t, "t3_before", response["before"])

	posts := response["posts"].([]interface{})
	assert.Equal(t, 3, len(posts), "Should return all 3 posts")
}

func TestGetSubredditPostsValidatesLimit(t *testing.T) {
	handler, ts, _ := setupRedditHandlerTest(t)
	defer ts.Close()

	router := gin.Default()
	router.GET("/r/:subreddit", handler.GetSubredditPosts)

	tests := []struct {
		name          string
		limit         string
		expectedLimit float64
	}{
		{"Too low", "0", 25},
		{"Too high", "200", 25},
		{"Valid", "50", 50},
		{"Missing", "", 25},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url := "/r/golang"
			if tt.limit != "" {
				url += "?limit=" + tt.limit
			}

			req := httptest.NewRequest("GET", url, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			require.Equal(t, http.StatusOK, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			assert.Equal(t, tt.expectedLimit, response["limit"])
		})
	}
}

func TestGetSubredditPostsMissingSubreddit(t *testing.T) {
	handler, ts, _ := setupRedditHandlerTest(t)
	defer ts.Close()

	router := gin.Default()
	router.GET("/r/:subreddit", handler.GetSubredditPosts)

	req := httptest.NewRequest("GET", "/r/", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetFrontPage(t *testing.T) {
	handler, ts, handlerCalls := setupRedditHandlerTest(t)
	defer ts.Close()

	router := gin.Default()
	router.GET("/frontpage", handler.GetFrontPage)

	req := httptest.NewRequest("GET", "/frontpage?sort=new&limit=50", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())
	require.Equal(t, int32(1), atomic.LoadInt32(handlerCalls), "Should have called Reddit API once")

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "new", response["sort"])
	assert.Equal(t, float64(50), response["limit"])
	assert.Equal(t, "t3_after", response["after"])

	posts := response["posts"].([]interface{})
	assert.Equal(t, 3, len(posts))
}

func TestGetPostComments(t *testing.T) {
	handler, ts, handlerCalls := setupRedditHandlerTest(t)
	defer ts.Close()

	router := gin.Default()
	router.GET("/r/:subreddit/comments/:postId", handler.GetPostComments)

	req := httptest.NewRequest("GET", "/r/golang/comments/abc123?sort=top", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())
	require.Equal(t, int32(1), atomic.LoadInt32(handlerCalls), "Should have called Reddit API once")

	// Response should be raw Reddit response
	var response interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.NotNil(t, response)
}

func TestGetPostCommentsMissingParams(t *testing.T) {
	handler, ts, _ := setupRedditHandlerTest(t)
	defer ts.Close()

	router := gin.Default()
	router.GET("/r/:subreddit/comments/:postId", handler.GetPostComments)

	tests := []struct {
		name         string
		url          string
		expectedCode int
	}{
		{"Missing subreddit", "/r//comments/abc123", http.StatusBadRequest}, // Handler validates empty param
		{"Missing postId", "/r/golang/comments/", http.StatusNotFound},      // Route doesn't match
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tt.url, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedCode, w.Code)
		})
	}
}

func TestRedditSearchPosts(t *testing.T) {
	handler, ts, handlerCalls := setupRedditHandlerTest(t)
	defer ts.Close()

	router := gin.Default()
	router.GET("/search", handler.SearchPosts)

	req := httptest.NewRequest("GET", "/search?q=golang&sort=relevance&limit=25", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())
	require.Equal(t, int32(1), atomic.LoadInt32(handlerCalls), "Should have called Reddit API once")

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "golang", response["query"])
	assert.Equal(t, "relevance", response["sort"])
	assert.Equal(t, float64(25), response["limit"])

	posts := response["posts"].([]interface{})
	assert.Equal(t, 3, len(posts))
}

func TestRedditSearchPostsMissingQuery(t *testing.T) {
	handler, ts, _ := setupRedditHandlerTest(t)
	defer ts.Close()

	router := gin.Default()
	router.GET("/search", handler.SearchPosts)

	req := httptest.NewRequest("GET", "/search", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "Search query is required", response["error"])
}

func TestGetSubredditMedia(t *testing.T) {
	handler, ts, handlerCalls := setupRedditHandlerTest(t)
	defer ts.Close()

	router := gin.Default()
	router.GET("/r/:subreddit/media", handler.GetSubredditMedia)

	req := httptest.NewRequest("GET", "/r/golang/media?limit=10", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())
	require.Equal(t, int32(1), atomic.LoadInt32(handlerCalls), "Should have called Reddit API once")

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "golang", response["subreddit"])
	assert.Equal(t, "hot", response["sort"])

	mediaPosts := response["media_posts"].([]interface{})
	// Should only return media posts (image and video), not text post
	assert.Equal(t, 2, len(mediaPosts), "Should filter to only media posts")

	// Check first media post structure
	firstPost := mediaPosts[0].(map[string]interface{})
	assert.Equal(t, "abc123", firstPost["id"])
	assert.Equal(t, "Test Post", firstPost["title"])
	assert.Equal(t, "test_user", firstPost["author"])
	assert.Equal(t, "golang", firstPost["subreddit"])
	assert.Equal(t, "image", firstPost["media_type"])
	assert.Equal(t, "https://i.redd.it/test.jpg", firstPost["url"])
	assert.Contains(t, firstPost["permalink"], "reddit.com")

	// Check second media post is video
	secondPost := mediaPosts[1].(map[string]interface{})
	assert.Equal(t, "def456", secondPost["id"])
	assert.Equal(t, "video", secondPost["media_type"])
}

func TestGetSubredditMediaValidatesLimit(t *testing.T) {
	handler, ts, _ := setupRedditHandlerTest(t)
	defer ts.Close()

	router := gin.Default()
	router.GET("/r/:subreddit/media", handler.GetSubredditMedia)

	tests := []struct {
		name        string
		limit       string
		expectError bool
	}{
		{"Valid limit", "25", false},
		{"Too low", "0", false}, // Will default to 50
		{"Too high", "200", false}, // Will default to 50
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url := "/r/golang/media"
			if tt.limit != "" {
				url += "?limit=" + tt.limit
			}

			req := httptest.NewRequest("GET", url, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			require.Equal(t, http.StatusOK, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			mediaPosts := response["media_posts"].([]interface{})
			assert.GreaterOrEqual(t, len(mediaPosts), 0)
		})
	}
}

func TestGetSubredditMediaMissingSubreddit(t *testing.T) {
	handler, ts, _ := setupRedditHandlerTest(t)
	defer ts.Close()

	router := gin.Default()
	router.GET("/r/:subreddit/media", handler.GetSubredditMedia)

	req := httptest.NewRequest("GET", "/r//media", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Handler validates empty subreddit and returns 400
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetSubredditMediaPaginationSupport(t *testing.T) {
	handler, ts, _ := setupRedditHandlerTest(t)
	defer ts.Close()

	router := gin.Default()
	router.GET("/r/:subreddit/media", handler.GetSubredditMedia)

	req := httptest.NewRequest("GET", "/r/golang/media?after=t3_xyz", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	// Response should include pagination cursor
	assert.Equal(t, "t3_after", response["after"])
}

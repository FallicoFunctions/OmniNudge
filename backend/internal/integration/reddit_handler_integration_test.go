package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/chatreddit/backend/internal/handlers"
	"github.com/chatreddit/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// mapCache is a simple in-memory cache for testing
type mapCache struct {
	store map[string]string
}

func (m *mapCache) Get(_ context.Context, key string) (string, bool, error) {
	v, ok := m.store[key]
	return v, ok, nil
}

func (m *mapCache) Set(_ context.Context, key string, value string, ttl time.Duration) error {
	m.store[key] = value
	return nil
}

// stubTransport returns a canned Reddit listing and tracks hits
type stubTransport struct {
	hits *int32
}

func (t *stubTransport) RoundTrip(_ *http.Request) (*http.Response, error) {
	atomic.AddInt32(t.hits, 1)
	resp := map[string]interface{}{
		"kind": "Listing",
		"data": map[string]interface{}{
			"after":  nil,
			"before": nil,
			"children": []map[string]interface{}{
				{"kind": "t3", "data": map[string]interface{}{"id": "abc", "title": "hello", "subreddit": "test"}},
			},
		},
	}
	b, _ := json.Marshal(resp)
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(bytes.NewReader(b)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}, nil
}

func TestRedditFrontpageMockCaching(t *testing.T) {
	var hits int32
	cache := &mapCache{store: make(map[string]string)}
	client := services.NewRedditClient("ua", cache, 5*time.Minute)
	client.HTTPClientForTest().Transport = &stubTransport{hits: &hits}

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := handlers.NewRedditHandler(client, nil)
	router.GET("/api/v1/reddit/frontpage", handler.GetFrontPage)

	// First call hits upstream
	w := doRequest(t, router, httptest.NewRequest("GET", "/api/v1/reddit/frontpage", nil))
	require.Equal(t, http.StatusOK, w.Code)
	require.EqualValues(t, 1, atomic.LoadInt32(&hits))

	// Second call should be served from cache (no additional hit)
	w = doRequest(t, router, httptest.NewRequest("GET", "/api/v1/reddit/frontpage", nil))
	require.Equal(t, http.StatusOK, w.Code)
	require.EqualValues(t, 1, atomic.LoadInt32(&hits))
}

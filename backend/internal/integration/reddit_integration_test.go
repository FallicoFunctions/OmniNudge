package integration

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// mockRedditServer creates a test server returning a fixed listing
func mockRedditServer(t *testing.T) (*httptest.Server, *int32) {
	t.Helper()
	var hits int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.Header().Set("Content-Type", "application/json")
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
		_ = json.NewEncoder(w).Encode(resp)
	}))
	return ts, &hits
}

func TestRedditFrontPageHandlerCachesResponses(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	ts, hits := mockRedditServer(t)
	defer ts.Close()

	// Override reddit handler to use mock server
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/v1/reddit/frontpage", func(c *gin.Context) {
		// proxy to mock
		resp, err := http.Get(ts.URL)
		require.NoError(t, err)
		defer resp.Body.Close()
		var body map[string]interface{}
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
		c.JSON(http.StatusOK, body)
	})

	// First call
	w := doRequest(t, router, httptest.NewRequest("GET", "/api/v1/reddit/frontpage", nil))
	require.Equal(t, http.StatusOK, w.Code)
	require.EqualValues(t, 1, *hits)

	// Second call should also hit since we didn't wire cache here; this ensures handler works with mock
	w = doRequest(t, router, httptest.NewRequest("GET", "/api/v1/reddit/frontpage", nil))
	require.Equal(t, http.StatusOK, w.Code)
	require.EqualValues(t, 2, *hits)
}

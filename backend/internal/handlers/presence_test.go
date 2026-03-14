package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestPresenceStore() *services.PresenceStore {
	return services.NewPresenceStore(5 * time.Minute)
}

// ─── SubredditPresenceHandler tests ──────────────────────────────────────────

func TestPingSubredditPresence_Anonymous(t *testing.T) {
	handler := NewSubredditPresenceHandler(newTestPresenceStore())

	router := gin.New()
	router.POST("/subreddits/:name/active-users/ping", handler.PingSubredditPresence)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/subreddits/golang/active-users/ping", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "golang", resp["subreddit"])
	assert.GreaterOrEqual(t, int(resp["active_users"].(float64)), 1)
}

func TestPingSubredditPresence_AuthenticatedUser(t *testing.T) {
	handler := NewSubredditPresenceHandler(newTestPresenceStore())

	router := gin.New()
	router.POST("/subreddits/:name/active-users/ping", func(c *gin.Context) {
		c.Set("user_id", 99)
		handler.PingSubredditPresence(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/subreddits/golang/active-users/ping", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "golang", resp["subreddit"])
}

func TestPingSubredditPresence_CaseNormalized(t *testing.T) {
	handler := NewSubredditPresenceHandler(newTestPresenceStore())

	router := gin.New()
	router.POST("/subreddits/:name/active-users/ping", handler.PingSubredditPresence)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/subreddits/GoLang/active-users/ping", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	// Subreddit name should be lowercased in response
	assert.Equal(t, "golang", resp["subreddit"])
}

func TestGetSubredditActiveUsers_ReturnsCount(t *testing.T) {
	store := newTestPresenceStore()
	// Pre-seed presence for the subreddit
	store.Touch("pics", "u:1")
	store.Touch("pics", "u:2")

	handler := NewSubredditPresenceHandler(store)

	router := gin.New()
	router.GET("/subreddits/:name/active-users", func(c *gin.Context) {
		c.Set("user_id", 3)
		handler.GetSubredditActiveUsers(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/subreddits/pics/active-users", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	// 2 pre-seeded + 1 from this request = 3
	assert.Equal(t, float64(3), resp["active_users"])
}

func TestGetSubredditActiveUsers_WindowSeconds(t *testing.T) {
	handler := NewSubredditPresenceHandler(newTestPresenceStore())

	router := gin.New()
	router.GET("/subreddits/:name/active-users", handler.GetSubredditActiveUsers)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/subreddits/programming/active-users", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, float64(300), resp["window_seconds"]) // 5 minutes TTL
}

// ─── HubPresenceHandler tests ─────────────────────────────────────────────────

func TestPingHubPresence_Anonymous(t *testing.T) {
	handler := NewHubPresenceHandler(newTestPresenceStore())

	router := gin.New()
	router.POST("/hubs/:name/active-users/ping", handler.PingHubPresence)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/hubs/tech-hub/active-users/ping", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "tech-hub", resp["hub"])
	assert.GreaterOrEqual(t, int(resp["active_users"].(float64)), 1)
}

func TestPingHubPresence_AuthenticatedUser(t *testing.T) {
	handler := NewHubPresenceHandler(newTestPresenceStore())

	router := gin.New()
	router.POST("/hubs/:name/active-users/ping", func(c *gin.Context) {
		c.Set("user_id", 55)
		handler.PingHubPresence(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/hubs/science/active-users/ping", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "science", resp["hub"])
}

func TestPingHubPresence_CaseNormalized(t *testing.T) {
	handler := NewHubPresenceHandler(newTestPresenceStore())

	router := gin.New()
	router.POST("/hubs/:name/active-users/ping", handler.PingHubPresence)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/hubs/TechHub/active-users/ping", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "techhub", resp["hub"])
}

func TestGetHubActiveUsers_ReturnsCount(t *testing.T) {
	store := newTestPresenceStore()
	store.Touch("gaming", "u:10")
	store.Touch("gaming", "u:11")

	handler := NewHubPresenceHandler(store)

	router := gin.New()
	router.GET("/hubs/:name/active-users", func(c *gin.Context) {
		c.Set("user_id", 12)
		handler.GetHubActiveUsers(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/hubs/gaming/active-users", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, float64(3), resp["active_users"])
}

func TestGetHubActiveUsers_WindowSeconds(t *testing.T) {
	handler := NewHubPresenceHandler(newTestPresenceStore())

	router := gin.New()
	router.GET("/hubs/:name/active-users", handler.GetHubActiveUsers)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/hubs/sports/active-users", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, float64(300), resp["window_seconds"])
}

func TestPresence_MultipleUniqueUsersTracked(t *testing.T) {
	store := newTestPresenceStore()
	handler := NewSubredditPresenceHandler(store)

	router := gin.New()
	router.POST("/subreddits/:name/active-users/ping", func(c *gin.Context) {
		// Each call is by a distinct user
		handler.PingSubredditPresence(c)
	})

	// Ping from 3 different IPs
	for i, ip := range []string{"1.2.3.4", "5.6.7.8", "9.10.11.12"} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/subreddits/news/active-users/ping", nil)
		req.Header.Set("X-Real-IP", ip)
		router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		// Count should grow with each unique visitor
		assert.GreaterOrEqual(t, int(resp["active_users"].(float64)), i+1)
	}
}

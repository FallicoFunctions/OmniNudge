package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/websocket"
	"github.com/stretchr/testify/assert"
)

// newTestWebSocketHandler builds a WebSocketHandler with a real Hub but nil
// Authorizer and SettingsRepository so it can be used in unit tests that only
// exercise auth-rejection paths (no actual WebSocket upgrade needed).
func newTestWebSocketHandler() *WebSocketHandler {
	hub := websocket.NewHub()
	return NewWebSocketHandler(hub, nil, nil)
}

func TestWebSocketUpgrade_NoAuth(t *testing.T) {
	handler := newTestWebSocketHandler()

	router := gin.New()
	// No middleware sets "user_id" — GetAuthenticatedUserID will write 401.
	router.GET("/ws", handler.HandleWebSocket)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code, w.Body.String())
}

func TestWebSocketUpgrade_InvalidToken(t *testing.T) {
	handler := newTestWebSocketHandler()

	router := gin.New()
	// Simulate middleware that rejected the token and never set "user_id".
	router.GET("/ws", handler.HandleWebSocket)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Authorization", "Bearer this.is.not.a.valid.token")
	router.ServeHTTP(w, req)

	// Without "user_id" in context, handler returns 401.
	assert.Equal(t, http.StatusUnauthorized, w.Code, w.Body.String())
}

func TestWebSocketUpgrade_ValidToken_UpgradeAttempt(t *testing.T) {
	handler := newTestWebSocketHandler()

	router := gin.New()
	// Simulate successful auth middleware by injecting user_id into context.
	router.GET("/ws", func(c *gin.Context) {
		c.Set("user_id", 42)
		handler.HandleWebSocket(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	// httptest.ResponseRecorder does not implement http.Hijacker, so the
	// WebSocket upgrade will fail after auth succeeds.
	// We therefore expect either 101 (impossible here) or an upgrade error
	// response. The important assertion is that we do NOT get 401.
	router.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusUnauthorized, w.Code,
		"valid auth should not produce 401; upgrade failure is expected in test context")
}

func TestGetHub_ReturnsHub(t *testing.T) {
	handler := newTestWebSocketHandler()
	hub := handler.GetHub()
	assert.NotNil(t, hub)
}

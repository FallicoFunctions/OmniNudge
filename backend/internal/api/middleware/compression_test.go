package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestCompressionSkipsWebSocketUpgradeRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(Compression())
	router.GET("/ws", func(c *gin.Context) {
		c.String(http.StatusOK, "upgrade response")
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("Connection", "keep-alive, Upgrade")
	req.Header.Set("Upgrade", "websocket")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	require.Empty(t, recorder.Header().Get("Content-Encoding"))
	require.Equal(t, "upgrade response", recorder.Body.String())
}

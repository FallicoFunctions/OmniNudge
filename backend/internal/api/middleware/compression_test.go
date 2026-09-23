package middleware

import (
	"net/http"
	"net/http/httptest"
	"strconv"
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

func TestCompressionLeavesAnExactLengthResponseAlone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	body := []byte("opaque ciphertext that a gzip stream would not match in length")

	router := gin.New()
	router.Use(Compression())
	router.GET("/file", func(c *gin.Context) {
		c.Header("Content-Type", "application/octet-stream")
		c.Header("Content-Length", strconv.Itoa(len(body)))
		_, _ = c.Writer.Write(body)
	})

	req := httptest.NewRequest(http.MethodGet, "/file", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	require.Empty(t, recorder.Header().Get("Content-Encoding"))
	require.Equal(t, strconv.Itoa(len(body)), recorder.Header().Get("Content-Length"))
	require.Equal(t, body, recorder.Body.Bytes())
}

func TestCompressionStillCompressesAResponseWithoutALength(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(Compression())
	router.GET("/json", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/json", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	require.Equal(t, "gzip", recorder.Header().Get("Content-Encoding"))
}

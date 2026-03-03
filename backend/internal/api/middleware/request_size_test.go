package middleware

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRequestSizeLimiter_RejectsTooLargeContentLength(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequestSizeLimiter(1024))
	router.POST("/test", func(c *gin.Context) {
		_, err := io.ReadAll(c.Request.Body)
		var maxErr *http.MaxBytesError
		if err != nil && errors.As(err, &maxErr) {
			c.Status(http.StatusRequestEntityTooLarge)
			return
		}
		require.NoError(t, err)
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(make([]byte, 2048)))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
}

type infiniteBody struct{}

func (infiniteBody) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 'a'
	}
	return len(p), nil
}

func (infiniteBody) Close() error { return nil }

func TestRequestSizeLimiter_BlocksUnknownLengthOversizeOnPartialRead(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequestSizeLimiter(1024))
	router.POST("/test", func(c *gin.Context) {
		buf := make([]byte, 8)
		_, err := c.Request.Body.Read(buf)
		var maxErr *http.MaxBytesError
		if err != nil && errors.As(err, &maxErr) {
			c.Status(http.StatusRequestEntityTooLarge)
			return
		}
		require.NoError(t, err)
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/test", infiniteBody{})
	req.ContentLength = -1 // emulate chunked/unknown-length request body
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
}

func TestRequestSizeLimiter_ExactLimitAllowed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequestSizeLimiter(1024))
	router.POST("/test", func(c *gin.Context) {
		_, err := io.ReadAll(c.Request.Body)
		require.NoError(t, err)
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(make([]byte, 1024)))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
}

func TestRequestSizeLimiter_RouteMiddlewareOverridesGroupLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	group := router.Group("/api")
	group.Use(RequestSizeLimiter(1024)) // 1KB group default
	group.POST("/upload", RequestSizeLimiter(4096), func(c *gin.Context) {
		_, err := io.ReadAll(c.Request.Body)
		require.NoError(t, err)
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/upload", bytes.NewReader(make([]byte, 2048)))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
}

func TestRequestSizeLimiter_BlocksKnownOversizeEvenOnPartialRead(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequestSizeLimiter(1024))
	router.POST("/test", func(c *gin.Context) {
		buf := make([]byte, 8)
		_, err := c.Request.Body.Read(buf)
		var maxErr *http.MaxBytesError
		if err != nil && errors.As(err, &maxErr) {
			c.Status(http.StatusRequestEntityTooLarge)
			return
		}
		require.NoError(t, err)
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(make([]byte, 2048)))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
}

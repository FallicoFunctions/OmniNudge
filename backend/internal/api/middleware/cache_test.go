package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestCacheControlTreatsUploadsAsPrivateByDefault(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(CacheControl())
	router.GET("/uploads/*filepath", func(c *gin.Context) {
		c.Status(http.StatusNotFound)
	})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/uploads/private-object", nil))

	require.Equal(t, http.StatusNotFound, recorder.Code)
	require.Equal(t, "private, no-store", recorder.Header().Get("Cache-Control"))
	require.Equal(t, "no-cache", recorder.Header().Get("Pragma"))
	require.Equal(t, "0", recorder.Header().Get("Expires"))
}

package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRequireHubModeratorOrAdminRejectsMalformedUserContext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", "not-an-int")
		c.Next()
	})
	router.Use(RequireHubModeratorOrAdmin(nil, nil, nil, nil, nil, nil))
	router.GET("/mod/hubs/:hub_name/bans", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/mod/hubs/example/bans", nil))
	require.Equal(t, http.StatusUnauthorized, response.Code)
}

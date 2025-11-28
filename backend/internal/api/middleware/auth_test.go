package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/chatreddit/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRequireRole_AllowsMatchingRole(t *testing.T) {
	allowed := false
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("role", "admin")
	})
	router.Use(RequireRole("admin", "moderator"))
	router.GET("/", func(c *gin.Context) {
		allowed = true
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/", nil)
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	require.True(t, allowed, "handler should run for allowed role")
}

func TestRequireRole_BlocksWhenRoleMissing(t *testing.T) {
	router := gin.New()
	router.Use(RequireRole("admin"))
	router.GET("/", func(c *gin.Context) {
		t.Fatalf("handler should not run")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/", nil)
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusForbidden, w.Code)
}

func TestRequireRole_BlocksWhenRoleMismatch(t *testing.T) {
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("role", "user")
	})
	router.Use(RequireRole("admin"))
	router.GET("/", func(c *gin.Context) {
		t.Fatalf("handler should not run")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/", nil)
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusForbidden, w.Code)
}

func TestAuthRequired_SetsContextOnValidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	authService := services.NewAuthService("", "", "", "test-secret", "ua")
	token, err := authService.GenerateJWT(42, "rid", "alice", "user")
	require.NoError(t, err)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req, _ := http.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	c.Request = req

	handler := AuthRequired(authService)
	handler(c)

	require.Equal(t, http.StatusOK, w.Code)
	uid, ok := c.Get("user_id")
	require.True(t, ok)
	require.Equal(t, 42, uid.(int))
	role, ok := c.Get("role")
	require.True(t, ok)
	require.Equal(t, "user", role.(string))
}

func TestAuthRequired_RejectsMissingHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	authService := services.NewAuthService("", "", "", "test-secret", "ua")

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req, _ := http.NewRequest("GET", "/", nil)
	c.Request = req

	handler := AuthRequired(authService)
	handler(c)

	require.Equal(t, http.StatusUnauthorized, w.Code)
}

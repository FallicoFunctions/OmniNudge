package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/chatreddit/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// helper to perform a request through a middleware + handler chain
func performRequest(t *testing.T, h gin.HandlerFunc, role interface{}) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req, _ := http.NewRequest("GET", "/", nil)
	c.Request = req
	if role != nil {
		c.Set("role", role)
	}
	h(c)
	return w
}

func TestRequireRole_AllowsMatchingRole(t *testing.T) {
	allowed := false
	handler := RequireRole("admin", "moderator")(func(c *gin.Context) {
		allowed = true
		c.Status(http.StatusOK)
	})
	w := performRequest(t, handler, "admin")
	require.Equal(t, http.StatusOK, w.Code)
	require.True(t, allowed, "handler should run for allowed role")
}

func TestRequireRole_BlocksWhenRoleMissing(t *testing.T) {
	handler := RequireRole("admin")(func(c *gin.Context) {
		t.Fatalf("handler should not run")
	})
	w := performRequest(t, handler, nil)
	require.Equal(t, http.StatusForbidden, w.Code)
}

func TestRequireRole_BlocksWhenRoleMismatch(t *testing.T) {
	handler := RequireRole("admin")(func(c *gin.Context) {
		t.Fatalf("handler should not run")
	})
	w := performRequest(t, handler, "user")
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

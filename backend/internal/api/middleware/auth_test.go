package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
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

func TestCORS_AllowsLocalhostAndLoopbackDevOrigins(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, origin := range []string{
		"https://play.omninudge.com",
		"http://localhost:4173",
		"http://localhost:5176",
		"http://127.0.0.1:4173",
		"http://127.0.0.1:5176",
	} {
		t.Run(origin, func(t *testing.T) {
			router := gin.New()
			router.Use(CORS())
			router.OPTIONS("/", func(c *gin.Context) {
				c.Status(http.StatusOK)
			})

			w := httptest.NewRecorder()
			req, _ := http.NewRequest("OPTIONS", "/", nil)
			req.Header.Set("Origin", origin)
			router.ServeHTTP(w, req)

			require.Equal(t, http.StatusNoContent, w.Code)
			require.Equal(t, origin, w.Header().Get("Access-Control-Allow-Origin"))
			require.Equal(t, "true", w.Header().Get("Access-Control-Allow-Credentials"))
		})
	}
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
	authService := services.NewAuthService("test-secret", "ua", "")
	token, err := authService.GenerateJWT(42, "alice", "user")
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
	authService := services.NewAuthService("test-secret", "ua", "")

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req, _ := http.NewRequest("GET", "/", nil)
	c.Request = req

	handler := AuthRequired(authService)
	handler(c)

	require.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuthRequired_RejectsInvalidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	authService := services.NewAuthService("test-secret", "ua", "")

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req, _ := http.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer not-a-valid-token")
	c.Request = req

	handler := AuthRequired(authService)
	handler(c)

	require.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuthRequired_RejectsExpiredToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	authService := services.NewAuthService("test-secret", "ua", "")
	token, err := authService.GenerateJWTWithExpiry(42, "alice", "user", -1)
	require.NoError(t, err)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req, _ := http.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	c.Request = req

	handler := AuthRequired(authService)
	handler(c)

	require.Equal(t, http.StatusUnauthorized, w.Code)
}

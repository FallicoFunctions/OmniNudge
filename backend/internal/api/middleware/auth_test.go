package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/testutil"
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

func TestAuthRequired_CookieSessionRequiresCSRFForMutations(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	user := testutil.NewFixtures(t, db).CreateUniqueUser("cookie_auth")
	auth := services.NewAuthService("cookie-test-secret", "test", "")
	sessions := services.NewAuthSessionService(db.Pool, auth)
	auth.SetSessionService(sessions)
	credentials, err := sessions.Create(t.Context(), user, false, "test browser", "")
	require.NoError(t, err)

	request := func(method string, includeCSRF bool) int {
		router := gin.New()
		router.Use(AuthRequired(auth))
		router.Handle(method, "/", func(c *gin.Context) { c.Status(http.StatusNoContent) })
		req := httptest.NewRequest(method, "/", nil)
		req.AddCookie(&http.Cookie{Name: services.AccessTokenCookieName, Value: credentials.AccessToken})
		if includeCSRF {
			req.AddCookie(&http.Cookie{Name: services.CSRFTokenCookieName, Value: credentials.CSRFToken})
			req.Header.Set("X-CSRF-Token", credentials.CSRFToken)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w.Code
	}

	require.Equal(t, http.StatusNoContent, request(http.MethodGet, false))
	require.Equal(t, http.StatusForbidden, request(http.MethodPost, false))
	require.Equal(t, http.StatusNoContent, request(http.MethodPost, true))
}

func TestCORS_AllowsLocalhostAndLoopbackDevOrigins(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, origin := range []string{
		"http://localhost:5176",
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

func TestAuthRequired_RejectsWebSocketTokenOnHTTP(t *testing.T) {
	gin.SetMode(gin.TestMode)
	authService := services.NewAuthService("test-secret", "ua", "")
	token, err := authService.GenerateWebSocketJWT(42, "alice", "user", 0)
	require.NoError(t, err)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	c.Request = req
	AuthRequired(authService)(c)
	require.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuthRequired_RejectsLegacyBrowserJWTWithoutSessionOrUse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const secret = "test-secret"
	legacy := jwt.NewWithClaims(jwt.SigningMethodHS256, services.JWTClaims{
		UserID: 42, Username: "alice", Role: "user",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: "OmniNudge", IssuedAt: jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	token, err := legacy.SignedString([]byte(secret))
	require.NoError(t, err)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	c.Request = req
	AuthRequired(services.NewAuthService(secret, "ua", ""))(c)
	require.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuthRequired_WebSocketQueryTokenTakesPrecedenceOverAccessCookie(t *testing.T) {
	gin.SetMode(gin.TestMode)
	authService := services.NewAuthService("test-secret", "ua", "")
	accessToken, err := authService.GenerateJWT(42, "alice", "user")
	require.NoError(t, err)
	wsToken, err := authService.GenerateWebSocketJWT(42, "alice", "user", 0)
	require.NoError(t, err)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest(http.MethodGet, "/?token="+wsToken, nil)
	req.Header.Set("Upgrade", "websocket")
	req.AddCookie(&http.Cookie{Name: services.AccessTokenCookieName, Value: accessToken})
	c.Request = req
	AuthRequired(authService)(c)
	require.Equal(t, http.StatusOK, w.Code)
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

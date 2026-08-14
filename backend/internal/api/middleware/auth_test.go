package middleware

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
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

func TestAuthOptional_CookieSessionDoesNotAssociateMutationWithoutCSRF(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	user := testutil.NewFixtures(t, db).CreateUniqueUser("optional_cookie_auth")
	auth := services.NewAuthService("cookie-test-secret", "test", "")
	sessions := services.NewAuthSessionService(db.Pool, auth)
	auth.SetSessionService(sessions)
	credentials, err := sessions.Create(t.Context(), user, false, "test browser", "")
	require.NoError(t, err)

	request := func(includeCSRF bool) int {
		router := gin.New()
		router.Use(AuthOptional(auth))
		router.POST("/", func(c *gin.Context) {
			if _, authenticated := c.Get("user_id"); authenticated {
				c.Status(http.StatusNoContent)
				return
			}
			c.Status(http.StatusAccepted)
		})
		req := httptest.NewRequest(http.MethodPost, "/", nil)
		req.AddCookie(&http.Cookie{Name: services.AccessTokenCookieName, Value: credentials.AccessToken})
		if includeCSRF {
			req.AddCookie(&http.Cookie{Name: services.CSRFTokenCookieName, Value: credentials.CSRFToken})
			req.Header.Set("X-CSRF-Token", credentials.CSRFToken)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w.Code
	}

	require.Equal(t, http.StatusAccepted, request(false))
	require.Equal(t, http.StatusNoContent, request(true))
}

// The downgrade above is deliberate: optional-auth routes include public write
// endpoints that must stay usable. What is not acceptable is doing it silently,
// which leaves a handler reporting that nobody is signed in when somebody is.
// This pins the warning that makes the drop visible, and the reason that says
// which check failed.
func TestAuthOptional_LogsWhyCookieIdentityWasDropped(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	user := testutil.NewFixtures(t, db).CreateUniqueUser("optional_cookie_log")
	auth := services.NewAuthService("cookie-test-secret", "test", "")
	sessions := services.NewAuthSessionService(db.Pool, auth)
	auth.SetSessionService(sessions)
	credentials, err := sessions.Create(t.Context(), user, false, "test browser", "")
	require.NoError(t, err)

	for _, tc := range []struct {
		name       string
		csrfCookie string
		csrfHeader string
		wantReason string
		wantStatus int
	}{
		{"no csrf at all", "", "", "missing_csrf_cookie", http.StatusAccepted},
		{"cookie without header", credentials.CSRFToken, "", "missing_csrf_header", http.StatusAccepted},
		{"header disagrees with cookie", credentials.CSRFToken, "not-the-same-token", "csrf_cookie_header_mismatch", http.StatusAccepted},
		{"valid csrf", credentials.CSRFToken, credentials.CSRFToken, "", http.StatusNoContent},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var logs bytes.Buffer
			previous := zlog.Logger
			zlog.Logger = zerolog.New(&logs)
			previousLevel := zerolog.GlobalLevel()
			zerolog.SetGlobalLevel(zerolog.WarnLevel)
			t.Cleanup(func() {
				zlog.Logger = previous
				zerolog.SetGlobalLevel(previousLevel)
			})

			router := gin.New()
			router.Use(AuthOptional(auth))
			router.POST("/analytics/events", func(c *gin.Context) {
				if _, authenticated := c.Get("user_id"); authenticated {
					c.Status(http.StatusNoContent)
					return
				}
				c.Status(http.StatusAccepted)
			})

			req := httptest.NewRequest(http.MethodPost, "/analytics/events", nil)
			req.AddCookie(&http.Cookie{Name: services.AccessTokenCookieName, Value: credentials.AccessToken})
			if tc.csrfCookie != "" {
				req.AddCookie(&http.Cookie{Name: services.CSRFTokenCookieName, Value: tc.csrfCookie})
			}
			if tc.csrfHeader != "" {
				req.Header.Set("X-CSRF-Token", tc.csrfHeader)
			}
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// The request outcome must not change: a dropped identity still
			// serves the route anonymously rather than failing it.
			require.Equal(t, tc.wantStatus, w.Code)

			// Pick out our line rather than assuming it is the only output:
			// the logger swapped above is the global one, shared with any
			// other middleware that might write while this test runs.
			var found string
			for _, line := range strings.Split(strings.TrimSpace(logs.String()), "\n") {
				if strings.Contains(line, "cookie identity dropped") {
					found = line
					break
				}
			}

			if tc.wantReason == "" {
				require.Empty(t, found, "a successful CSRF check should not report a dropped identity")
				return
			}
			require.NotEmpty(t, found, "expected a warning that the identity was dropped")

			var entry struct {
				Level  string `json:"level"`
				Method string `json:"method"`
				Path   string `json:"path"`
				Reason string `json:"reason"`
			}
			require.NoError(t, json.Unmarshal([]byte(found), &entry))
			require.Equal(t, "warn", entry.Level)
			require.Equal(t, http.MethodPost, entry.Method)
			require.Equal(t, "/analytics/events", entry.Path)
			require.Equal(t, tc.wantReason, entry.Reason)
			require.NotContains(t, logs.String(), credentials.AccessToken, "the log must never carry the token")
		})
	}
}

func TestCORS_AllowsLocalhostAndLoopbackDevOrigins(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	gin.SetMode(gin.TestMode)

	for _, origin := range []string{
		"https://play.omninudge.com",
		"http://localhost:4173",
		"http://localhost:4174",
		"http://localhost:5176",
		"http://localhost:6099",
		"http://127.0.0.1:4173",
		"http://127.0.0.1:4174",
		"http://127.0.0.1:5176",
		"http://127.0.0.1:6099",
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
			require.Contains(t, w.Header().Values("Vary"), "Origin")
		})
	}
}

// A loopback origin is allowed in development so the OmniRave runtime dev
// server can be on any port, and must not be in production.
func TestCORS_ProductionRejectsDevelopmentOrigins(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(CORS())
	router.OPTIONS("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/", nil)
	req.Header.Set("Origin", "http://localhost:5176")
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusNoContent, w.Code)
	require.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
	require.Empty(t, w.Header().Get("Access-Control-Allow-Credentials"))
}

// The development allowance is loopback only; a LAN address is not a dev origin.
func TestCORS_RejectsNonLoopbackDevOrigins(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(CORS())
	router.OPTIONS("/", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/", nil)
	req.Header.Set("Origin", "http://192.168.1.10:4174")
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusNoContent, w.Code)
	require.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
	require.Empty(t, w.Header().Get("Access-Control-Allow-Credentials"))
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

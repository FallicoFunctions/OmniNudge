package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

const worldEventSecret = "world-event-secret-that-is-long-enough-ok"

func worldEventRouter(t *testing.T, worldEvents *services.WorldEventAuth) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequireWorldEvent(worldEvents))
	router.POST("/internal/world-event", func(c *gin.Context) {
		personaID, ok := c.Get(WorldEventContextKey)
		require.True(t, ok, "a request that reached the handler must name its persona")
		c.JSON(http.StatusOK, gin.H{"persona_id": personaID})
	})
	return router
}

func TestRequireWorldEvent_AcceptsTheWorld(t *testing.T) {
	worldEvents, err := services.NewWorldEventAuth(worldEventSecret, siteSecret)
	require.NoError(t, err)
	token, err := worldEvents.Mint(88, time.Minute)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/internal/world-event", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	worldEventRouter(t, worldEvents).ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Body.String(), "88")
}

// Self-tier memory is read by every person who talks to a character, so a user
// who could write it could put words in that character's mouth for everybody
// else. A browser attaches its cookies to whatever request it is told to make,
// which is why the session case gets its own test rather than being folded
// into "some invalid credential".
func TestRequireWorldEvent_IgnoresBrowserSessions(t *testing.T) {
	worldEvents, err := services.NewWorldEventAuth(worldEventSecret, siteSecret)
	require.NoError(t, err)

	site := services.NewAuthService(siteSecret, "OmniNudge", "")
	siteAccess, err := site.GenerateJWT(42, "alice", "user")
	require.NoError(t, err)

	for _, tc := range []struct {
		name    string
		prepare func(req *http.Request)
	}{
		{
			name: "a session cookie alone",
			prepare: func(req *http.Request) {
				req.AddCookie(&http.Cookie{Name: services.AccessTokenCookieName, Value: siteAccess})
			},
		},
		{
			name: "a session cookie with its CSRF token",
			prepare: func(req *http.Request) {
				req.AddCookie(&http.Cookie{Name: services.AccessTokenCookieName, Value: siteAccess})
				req.AddCookie(&http.Cookie{Name: services.CSRFTokenCookieName, Value: "csrf-value"})
				req.Header.Set("X-CSRF-Token", "csrf-value")
			},
		},
		{
			name: "a site access token presented as a bearer",
			prepare: func(req *http.Request) {
				req.Header.Set("Authorization", "Bearer "+siteAccess)
			},
		},
		{
			name: "an admin's session, which is still not the world",
			prepare: func(req *http.Request) {
				adminToken, tokenErr := site.GenerateJWT(1, "root", "admin")
				require.NoError(t, tokenErr)
				req.AddCookie(&http.Cookie{Name: services.AccessTokenCookieName, Value: adminToken})
				req.Header.Set("Authorization", "Bearer "+adminToken)
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/world-event", nil)
			tc.prepare(req)
			w := httptest.NewRecorder()
			worldEventRouter(t, worldEvents).ServeHTTP(w, req)

			require.Equal(t, http.StatusUnauthorized, w.Code,
				"a user session must never write a character's own memory, whatever role it holds")
		})
	}
}

// The other service credential is not this one. A runtime that may admit a
// character to a world does not thereby get to write that character's memory.
func TestRequireWorldEvent_RefusesAnAdmissionCredential(t *testing.T) {
	worldEvents, err := services.NewWorldEventAuth(worldEventSecret, siteSecret)
	require.NoError(t, err)
	admission, err := services.NewPersonaAdmissionAuth(admitSecret, siteSecret)
	require.NoError(t, err)

	admitToken, err := admission.Mint(88, time.Minute)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/internal/world-event", nil)
	req.Header.Set("Authorization", "Bearer "+admitToken)
	w := httptest.NewRecorder()
	worldEventRouter(t, worldEvents).ServeHTTP(w, req)

	require.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestRequireWorldEvent_RejectsMalformedCredentials(t *testing.T) {
	worldEvents, err := services.NewWorldEventAuth(worldEventSecret, siteSecret)
	require.NoError(t, err)

	for _, header := range []string{
		"",
		"Bearer",
		"Bearer ",
		"Basic dXNlcjpwYXNz",
		"Bearer not-a-token",
		"Bearer a.b.c",
	} {
		t.Run("header="+header, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/world-event", nil)
			if header != "" {
				req.Header.Set("Authorization", header)
			}
			w := httptest.NewRecorder()
			worldEventRouter(t, worldEvents).ServeHTTP(w, req)
			require.Equal(t, http.StatusUnauthorized, w.Code)
		})
	}
}

// A service started without the secret refuses rather than recording. Treating
// an unconfigured secret as "no check required" is how an endpoint like this
// ends up open in the one environment nobody remembered to configure.
func TestRequireWorldEvent_RefusesWhenUnconfigured(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/internal/world-event", nil)
	req.Header.Set("Authorization", "Bearer anything")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequireWorldEvent(nil))
	router.POST("/internal/world-event", func(c *gin.Context) {
		t.Fatal("an unconfigured service must never reach the handler")
	})
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusServiceUnavailable, w.Code)
}

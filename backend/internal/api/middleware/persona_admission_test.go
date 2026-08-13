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

const (
	admitSecret = "persona-admission-secret-that-is-long-enough"
	siteSecret  = "site-jwt-secret-that-is-also-long-enough-ok"
)

func admissionRouter(t *testing.T, admission *services.PersonaAdmissionAuth) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequirePersonaAdmission(admission))
	router.POST("/internal/admit", func(c *gin.Context) {
		personaID, ok := c.Get(PersonaAdmissionContextKey)
		require.True(t, ok, "a request that reached the handler must name its persona")
		c.JSON(http.StatusOK, gin.H{"persona_id": personaID})
	})
	return router
}

func TestRequirePersonaAdmission_AcceptsTheAgentRuntime(t *testing.T) {
	admission, err := services.NewPersonaAdmissionAuth(admitSecret, siteSecret)
	require.NoError(t, err)
	token, err := admission.Mint(88, time.Minute)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/internal/admit", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	admissionRouter(t, admission).ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Body.String(), "88")
}

// The invariant from the design: admission must never be reachable with a user
// session. A browser attaches its cookies to every request it is told to make,
// so if a session cookie could open this door, a page the user did not write
// could walk them through it and act as a character.
func TestRequirePersonaAdmission_IgnoresBrowserSessions(t *testing.T) {
	admission, err := services.NewPersonaAdmissionAuth(admitSecret, siteSecret)
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
			name: "an admin's session, which is still not the agent runtime",
			prepare: func(req *http.Request) {
				adminToken, tokenErr := site.GenerateJWT(1, "root", "admin")
				require.NoError(t, tokenErr)
				req.AddCookie(&http.Cookie{Name: services.AccessTokenCookieName, Value: adminToken})
				req.Header.Set("Authorization", "Bearer "+adminToken)
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/admit", nil)
			tc.prepare(req)
			w := httptest.NewRecorder()
			admissionRouter(t, admission).ServeHTTP(w, req)

			require.Equal(t, http.StatusUnauthorized, w.Code,
				"a user session must never admit a persona, whatever role it holds")
		})
	}
}

func TestRequirePersonaAdmission_RejectsMalformedCredentials(t *testing.T) {
	admission, err := services.NewPersonaAdmissionAuth(admitSecret, siteSecret)
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
			req := httptest.NewRequest(http.MethodPost, "/internal/admit", nil)
			if header != "" {
				req.Header.Set("Authorization", header)
			}
			w := httptest.NewRecorder()
			admissionRouter(t, admission).ServeHTTP(w, req)
			require.Equal(t, http.StatusUnauthorized, w.Code)
		})
	}
}

// A service started without the secret refuses rather than admitting. The
// alternative -- treating an unconfigured secret as "no check required" -- is
// how an endpoint like this ends up open in the one environment nobody
// remembered to configure.
func TestRequirePersonaAdmission_RefusesWhenUnconfigured(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/internal/admit", nil)
	req.Header.Set("Authorization", "Bearer anything")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequirePersonaAdmission(nil))
	router.POST("/internal/admit", func(c *gin.Context) {
		t.Fatal("an unconfigured service must never reach the handler")
	})
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusServiceUnavailable, w.Code)
}

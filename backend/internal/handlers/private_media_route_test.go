package handlers

import (
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

// The browser session cookie is scoped to /api/. Private files were served only
// at /uploads/, so no browser ever sent the session with them: the request
// arrived anonymous and every private photo, video and file answered 404. A
// cookie jar applies the same path rules a browser does, so this reads what a
// browser would actually attach to each route.
func TestTheSessionCookieReachesThePrivateFileRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	writeBrowserSessionCookies(c, &services.BrowserSessionCredentials{
		AccessToken:    "access",
		RefreshToken:   "refresh",
		CSRFToken:      "csrf",
		RefreshExpires: time.Now().Add(time.Hour),
		Persistent:     true,
	}, false)

	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	origin, err := url.Parse("http://localhost:8080/api/v1/auth/login")
	require.NoError(t, err)
	jar.SetCookies(origin, recorder.Result().Cookies())

	sends := func(path string) bool {
		target, err := url.Parse("http://localhost:8080" + path)
		require.NoError(t, err)
		for _, cookie := range jar.Cookies(target) {
			if cookie.Name == services.AccessTokenCookieName {
				return true
			}
		}
		return false
	}

	require.True(t, sends("/api/v1/uploads/7/photo.png"), "the private file route must receive the session")
	require.False(t, sends("/uploads/7/photo.png"), "the old route never did; nothing private may depend on it")
}

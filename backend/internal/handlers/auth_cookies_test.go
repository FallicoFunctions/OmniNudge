package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestBrowserSessionCookiesKeepCredentialsHttpOnlyAndCSRFReadable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	writeBrowserSessionCookies(c, &services.BrowserSessionCredentials{
		AccessToken: "access", RefreshToken: "refresh", CSRFToken: "csrf",
		RefreshExpires: time.Now().Add(time.Hour), Persistent: false,
	}, true)

	cookies := w.Result().Cookies()
	require.Len(t, cookies, 3)
	byName := make(map[string]bool, len(cookies))
	for _, cookie := range cookies {
		require.True(t, cookie.Secure)
		require.Equal(t, http.SameSiteStrictMode, cookie.SameSite)
		require.Zero(t, cookie.MaxAge)
		byName[cookie.Name] = cookie.HttpOnly
	}
	require.True(t, byName[services.AccessTokenCookieName])
	require.True(t, byName[services.RefreshTokenCookieName])
	require.False(t, byName[services.CSRFTokenCookieName])
}

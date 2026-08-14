package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
)

func writeBrowserSessionCookies(c *gin.Context, credentials *services.BrowserSessionCredentials, secure bool) {
	accessMaxAge := 0
	refreshMaxAge := 0
	if credentials.Persistent {
		accessMaxAge = int(services.AccessTokenTTL.Seconds())
		refreshMaxAge = max(1, int(time.Until(credentials.RefreshExpires).Seconds()))
	}

	// #nosec G124 -- Secure follows the validated deployment mode; HttpOnly and SameSite are explicitly set.
	http.SetCookie(c.Writer, &http.Cookie{
		Name: services.AccessTokenCookieName, Value: credentials.AccessToken,
		Path: "/api/", MaxAge: accessMaxAge, HttpOnly: true, Secure: secure,
		SameSite: http.SameSiteStrictMode,
	})
	// #nosec G124 -- Secure follows the validated deployment mode; HttpOnly and SameSite are explicitly set.
	http.SetCookie(c.Writer, &http.Cookie{
		Name: services.RefreshTokenCookieName, Value: credentials.RefreshToken,
		Path: "/api/v1/auth", MaxAge: refreshMaxAge, HttpOnly: true, Secure: secure,
		SameSite: http.SameSiteStrictMode,
	})
	// #nosec G124 -- the CSRF double-submit cookie must be script-readable; Secure and SameSite remain enforced.
	http.SetCookie(c.Writer, &http.Cookie{
		Name: services.CSRFTokenCookieName, Value: credentials.CSRFToken,
		Path: "/", MaxAge: refreshMaxAge, HttpOnly: false, Secure: secure,
		SameSite: http.SameSiteStrictMode,
	})
	c.Header("Cache-Control", "no-store")
}

func clearBrowserSessionCookies(c *gin.Context, secure bool) {
	// #nosec G124 -- these deletion cookies receive Secure and SameSite below before they are written.
	for _, cookie := range []http.Cookie{
		{Name: services.AccessTokenCookieName, Path: "/api/", HttpOnly: true},
		{Name: services.RefreshTokenCookieName, Path: "/api/v1/auth", HttpOnly: true},
		{Name: services.CSRFTokenCookieName, Path: "/", HttpOnly: false},
	} {
		cookie.Value = ""
		cookie.MaxAge = -1
		cookie.Expires = time.Unix(1, 0)
		cookie.Secure = secure
		cookie.SameSite = http.SameSiteStrictMode
		http.SetCookie(c.Writer, &cookie)
	}
	c.Header("Cache-Control", "no-store")
}

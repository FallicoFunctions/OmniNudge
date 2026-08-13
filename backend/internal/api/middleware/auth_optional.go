package middleware

import (
	"crypto/subtle"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/pkg/logger"
	"github.com/rs/zerolog/log"
)

// cookieCSRFFailure reports why a cookie-authenticated state-changing request
// failed the CSRF check, or "" when it passed. The reasons are fixed labels
// rather than values from the request, so logging one cannot leak a token.
func cookieCSRFFailure(c *gin.Context, authService *services.AuthService, sessionID string) string {
	csrfCookie, cookieErr := c.Cookie(services.CSRFTokenCookieName)
	csrfHeader := c.GetHeader("X-CSRF-Token")
	switch {
	case cookieErr != nil || csrfCookie == "":
		return "missing_csrf_cookie"
	case csrfHeader == "":
		return "missing_csrf_header"
	case subtle.ConstantTimeCompare([]byte(csrfCookie), []byte(csrfHeader)) != 1:
		return "csrf_cookie_header_mismatch"
	case sessionID == "":
		return "token_has_no_session"
	case authService.ValidateCSRF(c.Request.Context(), sessionID, csrfHeader) != nil:
		return "session_csrf_rejected"
	default:
		return ""
	}
}

// AuthOptional attempts to authenticate the request but never blocks if auth fails.
// If a valid Bearer token is provided, user context keys are populated.
func AuthOptional(authService *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		var tokenString string
		cookieAuth := false
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				c.Next()
				return
			}
			tokenString = parts[1]
		}
		if tokenString == "" {
			if cookieToken, err := c.Cookie(services.AccessTokenCookieName); err == nil && cookieToken != "" {
				tokenString = cookieToken
				cookieAuth = true
			}
		}
		if tokenString == "" {
			c.Next()
			return
		}
		claims, err := authService.ValidateJWTContext(c.Request.Context(), tokenString)
		if err != nil || claims.Use == "ws" {
			// Ignore invalid tokens in optional mode
			c.Next()
			return
		}
		// Optional-auth routes include a few public write endpoints (for example,
		// anonymous analytics and bug reports). A browser access-token cookie must
		// not silently associate a cross-site write with the signed-in user. Keep
		// such requests usable anonymously, but attach the cookie identity only
		// after the session-bound CSRF check succeeds.
		if cookieAuth && isStateChangingMethod(c.Request.Method) {
			if reason := cookieCSRFFailure(c, authService, claims.SessionID); reason != "" {
				// The request still proceeds, so nothing downstream reports that
				// identity was dropped. Without this line the only symptom is a
				// handler complaining that nobody is signed in when somebody is,
				// which is diagnosable only by bisecting the client.
				path := c.FullPath()
				if path == "" {
					path = logger.SanitizeLogMessage(c.Request.URL.Path)
				}
				log.Warn().
					Str("method", c.Request.Method).
					Str("path", path).
					Str("reason", reason).
					Msg("optional auth: cookie identity dropped, continuing anonymously")
				c.Next()
				return
			}
		}

		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Set("session_id", claims.SessionID)
		c.Set("auth_via_cookie", cookieAuth)
		c.Set("token_version", claims.TokenVersion)
		c.Next()
	}
}

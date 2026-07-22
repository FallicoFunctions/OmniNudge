package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	apiresponse "github.com/omninudge/backend/internal/api/response"
	"github.com/omninudge/backend/internal/services"
)

// AuthRequired middleware validates JWT tokens and sets user info in context
func AuthRequired(authService *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenString string
		cookieAuth := false

		authHeader := c.GetHeader("Authorization")
		isWebSocketUpgrade := strings.EqualFold(c.GetHeader("Upgrade"), "websocket")
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				apiresponse.WriteError(c, http.StatusUnauthorized, "Invalid authorization format. Use: Bearer <token>")
				c.Abort()
				return
			}
			tokenString = parts[1]
		}
		// Browser WebSocket requests carry a dedicated five-minute token in the
		// query because the API access cookie would otherwise mask it.
		if tokenString == "" && isWebSocketUpgrade {
			tokenString = c.Query("token")
		}
		if tokenString == "" {
			if cookieToken, err := c.Cookie(services.AccessTokenCookieName); err == nil && cookieToken != "" {
				tokenString = cookieToken
				cookieAuth = true
			}
		}

		if tokenString == "" {
			apiresponse.WriteError(c, http.StatusUnauthorized, "Authorization header required")
			c.Abort()
			return
		}

		claims, err := authService.ValidateJWTContext(c.Request.Context(), tokenString)
		if err != nil {
			apiresponse.WriteError(c, http.StatusUnauthorized, "Invalid or expired token")
			c.Abort()
			return
		}
		if isWebSocketUpgrade && !isValidWebSocketToken(claims) {
			apiresponse.WriteError(c, http.StatusUnauthorized, "Invalid WebSocket token")
			c.Abort()
			return
		}
		if !isWebSocketUpgrade && claims.Use == "ws" {
			apiresponse.WriteError(c, http.StatusUnauthorized, "WebSocket token cannot be used for HTTP requests")
			c.Abort()
			return
		}
		if cookieAuth && isStateChangingMethod(c.Request.Method) {
			csrfCookie, cookieErr := c.Cookie(services.CSRFTokenCookieName)
			csrfHeader := c.GetHeader("X-CSRF-Token")
			if cookieErr != nil || csrfCookie == "" || csrfHeader == "" ||
				subtle.ConstantTimeCompare([]byte(csrfCookie), []byte(csrfHeader)) != 1 ||
				claims.SessionID == "" ||
				authService.ValidateCSRF(c.Request.Context(), claims.SessionID, csrfHeader) != nil {
				apiresponse.WriteError(c, http.StatusForbidden, "CSRF validation failed")
				c.Abort()
				return
			}
		}

		// Set user info in context for handlers to use
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Set("session_id", claims.SessionID)
		c.Set("auth_via_cookie", cookieAuth)

		c.Next()
	}
}

func isStateChangingMethod(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func isValidWebSocketToken(claims *services.JWTClaims) bool {
	if claims.Use == "ws" {
		return true
	}
	if claims.ExpiresAt == nil || claims.IssuedAt == nil {
		return false
	}
	return claims.ExpiresAt.Time.Sub(claims.IssuedAt.Time) <= 5*time.Minute
}

// RequireRole enforces that a user has one of the allowed roles
func RequireRole(allowedRoles ...string) gin.HandlerFunc {
	roleSet := make(map[string]bool)
	for _, r := range allowedRoles {
		roleSet[r] = true
	}

	return func(c *gin.Context) {
		roleVal, exists := c.Get("role")
		if !exists {
			apiresponse.WriteError(c, http.StatusForbidden, "Insufficient permissions")
			c.Abort()
			return
		}
		role, ok := roleVal.(string)
		if !ok || !roleSet[role] {
			apiresponse.WriteError(c, http.StatusForbidden, "Insufficient permissions")
			c.Abort()
			return
		}
		c.Next()
	}
}

// CORS middleware for handling cross-origin requests
func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		// In production, restrict this to your frontend domain
		allowedOrigins := []string{
			"https://omninudge.com",
			"https://www.omninudge.com",
			"http://localhost:3000",
			"http://localhost:5173",
			"http://localhost:5174",
			"http://localhost:5175",
			"http://localhost:5176",
			"http://localhost:5177",
			"http://localhost:5178",
			"http://localhost:5179",
			"http://127.0.0.1:3000",
			"http://127.0.0.1:5173",
			"http://127.0.0.1:5174",
			"http://127.0.0.1:5175",
			"http://127.0.0.1:5176",
			"http://127.0.0.1:5177",
			"http://127.0.0.1:5178",
			"http://127.0.0.1:5179",
		}

		allowed := false
		for _, o := range allowedOrigins {
			if origin == o {
				allowed = true
				break
			}
		}

		if allowed {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

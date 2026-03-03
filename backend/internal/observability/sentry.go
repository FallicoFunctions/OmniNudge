// Package observability wires error tracking (Sentry) and continuous profiling
// (Pyroscope) into the application. All functions are no-ops when the relevant
// environment variables are absent, so the application runs cleanly in
// environments without these services configured.
package observability

import (
	"context"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// InitSentry initialises the Sentry SDK. It is a no-op when dsn is empty.
func InitSentry(dsn, env, version string) {
	if dsn == "" {
		return
	}
	err := sentry.Init(sentry.ClientOptions{
		Dsn:              dsn,
		Environment:      env,
		Release:          version,
		TracesSampleRate: 0.0, // tracing handled by OTel, not Sentry
		// Never send PII by default.
		SendDefaultPII: false,
	})
	if err != nil {
		log.Error().Err(err).Msg("sentry: failed to initialize")
		return
	}
	log.Info().Str("env", env).Msg("sentry: initialized")
}

// FlushSentry flushes buffered events to Sentry. Call this during graceful shutdown.
func FlushSentry() {
	sentry.Flush(2 * time.Second)
}

// CaptureError sends err to Sentry enriched with request context when available.
// It is a no-op when Sentry is not configured.
func CaptureError(ctx context.Context, err error) {
	if err == nil {
		return
	}
	hub := sentry.GetHubFromContext(ctx)
	if hub == nil {
		hub = sentry.CurrentHub()
	}
	hub.CaptureException(err)
}

// SentryMiddleware returns a Gin middleware that:
//  1. Attaches a Sentry hub clone to the request context.
//  2. Captures 5xx responses as Sentry events after the handler returns.
//  3. Recovers from panics and reports them to Sentry before re-panicking.
func SentryMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		hub := sentry.CurrentHub().Clone()
		hub.Scope().SetRequest(c.Request)
		ctx := sentry.SetHubOnContext(c.Request.Context(), hub)
		c.Request = c.Request.WithContext(ctx)

		defer func() {
			if r := recover(); r != nil {
				hub.RecoverWithContext(ctx, r)
				sentry.Flush(2 * time.Second)
				panic(r) // re-panic so Gin recovery middleware can handle it
			}
		}()

		c.Next()

		status := c.Writer.Status()
		if status >= 500 {
			// Build a synthetic error event from gin errors or a generic one.
			if len(c.Errors) > 0 {
				for _, ginErr := range c.Errors {
					hub.CaptureException(ginErr.Err)
				}
			} else {
				hub.WithScope(func(scope *sentry.Scope) {
					scope.SetTag("http.status", http_statusText(status))
					scope.SetTag("http.path", c.Request.URL.Path)
					scope.SetTag("http.method", c.Request.Method)
					// Capture a message rather than a synthetic error so Sentry groups
					// by path + status rather than by a fake error string.
					hub.CaptureMessage("HTTP 5xx: " + c.Request.Method + " " + c.Request.URL.Path)
				})
			}
		}
	}
}

func http_statusText(code int) string {
	switch code {
	case 500:
		return "500 Internal Server Error"
	case 502:
		return "502 Bad Gateway"
	case 503:
		return "503 Service Unavailable"
	case 504:
		return "504 Gateway Timeout"
	default:
		return "5xx Server Error"
	}
}

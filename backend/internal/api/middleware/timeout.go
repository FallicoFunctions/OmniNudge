package middleware

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
)

// Timeout attaches a context deadline to each request so that downstream
// code that honours ctx.Done() (database queries, HTTP clients, etc.) will
// be cancelled after the given duration.
//
// NOTE: This does NOT forcibly terminate a running handler — Go has no
// goroutine cancellation primitive. The HTTP server's WriteTimeout setting
// in main.go is the hard upper bound on how long any response can take.
// This middleware provides a cooperative cancellation signal that
// well-behaved handlers and database drivers will respect.
func Timeout(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

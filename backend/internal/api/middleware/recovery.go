package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"

	"github.com/gin-gonic/gin"
	zlog "github.com/rs/zerolog/log"
)

// Recovery returns a middleware that recovers from panics, logs the full stack
// trace via zerolog, and returns a 500 JSON response to the client.
// Wire this before all other middleware so panics are always caught.
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				stack := debug.Stack()
				zlog.Error().
					Str("panic", fmt.Sprintf("%v", r)).
					Str("stack", string(stack)).
					Str("path", c.Request.URL.Path).
					Str("method", c.Request.Method).
					Str("request_id", func() string {
						if v, ok := c.Get("request_id"); ok {
							if s, ok := v.(string); ok {
								return s
							}
						}
						return ""
					}()).
					Msg("panic recovered")

				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
					"error": "Internal server error",
					"code":  "INTERNAL_ERROR",
				})
			}
		}()
		c.Next()
	}
}

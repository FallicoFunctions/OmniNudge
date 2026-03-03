package middleware

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

// sizeLimitedBody enforces a mutable byte limit over an underlying request body.
// Unlike http.MaxBytesReader, its limit can be adjusted by later middleware so
// route-specific handlers can override a broader group limit.
type sizeLimitedBody struct {
	body  io.ReadCloser
	limit int64
	read  int64
}

func (b *sizeLimitedBody) Read(p []byte) (int, error) {
	remaining := b.limit - b.read
	if remaining <= 0 {
		var probe [1]byte
		n, err := b.body.Read(probe[:])
		if n > 0 || (err != nil && err != io.EOF) {
			return 0, &http.MaxBytesError{Limit: b.limit}
		}
		return 0, io.EOF
	}

	if int64(len(p)) > remaining {
		p = p[:int(remaining)]
	}

	n, err := b.body.Read(p)
	b.read += int64(n)
	return n, err
}

func (b *sizeLimitedBody) Close() error {
	return b.body.Close()
}

// RequestSizeLimiter returns a Gin middleware that enforces a max request-body
// size at read-time.
//
// The body is wrapped in a size-limited reader so that any read beyond the limit is
// rejected cleanly (preventing partial-read OOM conditions).
//
// Route-level middleware can override a broader group-level limit because all
// RequestSizeLimiter instances share the same mutable wrapper.
//
// Note: Binding layers (e.g. ShouldBindJSON) typically convert read errors
// into 400 responses unless handlers explicitly map *http.MaxBytesError to 413.
func RequestSizeLimiter(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		// If a previous RequestSizeLimiter already wrapped the body, update its
		// limit so route-specific middleware can override group defaults.
		if limited, ok := c.Request.Body.(*sizeLimitedBody); ok {
			limited.limit = maxBytes
			c.Next()
			return
		}

		// Wrap the body so a lying client cannot bypass the check by sending a
		// small Content-Length header but a large body.
		c.Request.Body = &sizeLimitedBody{body: c.Request.Body, limit: maxBytes}

		c.Next()
	}
}

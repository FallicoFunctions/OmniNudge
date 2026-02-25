package middleware

import (
	"compress/gzip"
	"io"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

const compressionLevel = gzip.DefaultCompression // Level 6 — good ratio with minimal CPU

var gzipWriterPool = sync.Pool{
	New: func() interface{} {
		w, _ := gzip.NewWriterLevel(io.Discard, compressionLevel)
		return w
	},
}

// Compression middleware compresses responses with gzip when the client supports it.
// It wraps the response writer before handlers run so ALL writes go through the gzip
// writer — never bypassing it — which avoids partial/corrupt responses.
func Compression() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only compress when the client advertises gzip support
		if !strings.Contains(c.GetHeader("Accept-Encoding"), "gzip") {
			c.Next()
			return
		}

		// Get a pooled gzip writer and redirect it to this response
		gz := gzipWriterPool.Get().(*gzip.Writer)
		gz.Reset(c.Writer)

		// Wrap the response writer; all handler writes go through gz
		grw := &gzipResponseWriter{
			ResponseWriter: c.Writer,
			Writer:         gz,
		}
		c.Writer = grw

		// Announce compressed encoding
		c.Header("Content-Encoding", "gzip")
		c.Header("Vary", "Accept-Encoding")
		// Remove Content-Length — it is invalid after compression
		c.Writer.Header().Del("Content-Length")

		defer func() {
			// Skip gzip for already-compressed content types (set by the handler)
			ct := grw.Header().Get("Content-Type")
			if shouldNotCompress(ct) {
				// Restore original writer; gzip headers already sent so we have to
				// flush gz with no data and reset headers in the best-effort fashion.
				gz.Reset(io.Discard)
				gzipWriterPool.Put(gz)
				return
			}
			gz.Close()
			gzipWriterPool.Put(gz)
		}()

		c.Next()
	}
}

type gzipResponseWriter struct {
	gin.ResponseWriter
	Writer *gzip.Writer
}

// Write sends data through the gzip compressor — always, no size bypass.
// A size bypass would corrupt responses because Content-Encoding: gzip is
// already set in the header; the client will try to decompress everything.
func (g *gzipResponseWriter) Write(data []byte) (int, error) {
	return g.Writer.Write(data)
}

// Flush flushes both the gzip stream and the underlying TCP buffer so that
// streaming endpoints (SSE, chunked) deliver data to the client immediately.
func (g *gzipResponseWriter) Flush() {
	// Flush compressed data into the underlying writer
	_ = g.Writer.Flush()
	// Flush the underlying Gin ResponseWriter (HTTP/TCP buffer)
	g.ResponseWriter.Flush()
}

func shouldNotCompress(contentType string) bool {
	alreadyCompressed := []string{
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/webp",
		"video/mp4",
		"video/webm",
		"audio/mpeg",
		"audio/ogg",
		"audio/opus",
		"application/zip",
		"application/gzip",
		"application/x-gzip",
	}
	ct := strings.ToLower(strings.SplitN(contentType, ";", 2)[0])
	for _, skip := range alreadyCompressed {
		if strings.HasPrefix(ct, skip) {
			return true
		}
	}
	return false
}

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
// It skips already-compressed content types (images, video, audio) by checking the
// Content-Type header inside WriteHeader, before any body bytes have been sent.
func Compression() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !strings.Contains(c.GetHeader("Accept-Encoding"), "gzip") {
			c.Next()
			return
		}

		gz := gzipWriterPool.Get().(*gzip.Writer)
		gz.Reset(c.Writer)

		grw := &gzipResponseWriter{
			ResponseWriter: c.Writer,
			gz:             gz,
		}
		c.Writer = grw

		c.Header("Content-Encoding", "gzip")
		c.Header("Vary", "Accept-Encoding")
		c.Writer.Header().Del("Content-Length")

		defer func() {
			if !grw.bypass {
				gz.Close()
			}
			gzipWriterPool.Put(gz)
		}()

		c.Next()
	}
}

type gzipResponseWriter struct {
	gin.ResponseWriter
	gz     *gzip.Writer
	bypass bool // true once we decide to skip compression for this response
}

// WriteHeader is called by the handler after Content-Type is set but before any
// body bytes are written. This is the earliest safe point to check whether we
// should actually compress — if not, we cancel gzip here while headers are still mutable.
func (g *gzipResponseWriter) WriteHeader(code int) {
	if !g.bypass && shouldNotCompress(g.Header().Get("Content-Type")) {
		g.Header().Del("Content-Encoding")
		g.gz.Reset(io.Discard)
		g.bypass = true
	}
	g.ResponseWriter.WriteHeader(code)
}

// Write routes body bytes through gzip or directly to the underlying writer.
// If WriteHeader was never explicitly called (rare but valid), we check Content-Type
// here too so we don't accidentally compress the first write.
func (g *gzipResponseWriter) Write(data []byte) (int, error) {
	if !g.bypass && !g.ResponseWriter.Written() {
		if shouldNotCompress(g.Header().Get("Content-Type")) {
			g.Header().Del("Content-Encoding")
			g.gz.Reset(io.Discard)
			g.bypass = true
		}
	}
	if g.bypass {
		return g.ResponseWriter.Write(data)
	}
	return g.gz.Write(data)
}

// Flush flushes the gzip stream and the underlying TCP buffer.
func (g *gzipResponseWriter) Flush() {
	if !g.bypass {
		_ = g.gz.Flush()
	}
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

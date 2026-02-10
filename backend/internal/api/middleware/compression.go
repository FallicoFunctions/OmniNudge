package middleware

import (
	"compress/gzip"
	"io"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

const (
	// Minimum response size to compress (1KB)
	minCompressionSize = 1024
	// Compression level (1-9, higher = more CPU, smaller size)
	compressionLevel = gzip.BestSpeed // Level 1 - fast, 60% compression
)

var gzipWriterPool = sync.Pool{
	New: func() interface{} {
		w, _ := gzip.NewWriterLevel(io.Discard, compressionLevel)
		return w
	},
}

// Compression middleware compresses responses with gzip
func Compression() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Check if client accepts gzip
		if !strings.Contains(c.GetHeader("Accept-Encoding"), "gzip") {
			c.Next()
			return
		}

		// Don't compress already compressed formats
		contentType := c.GetHeader("Content-Type")
		if shouldNotCompress(contentType) {
			c.Next()
			return
		}

		// Get gzip writer from pool
		gzipWriter := gzipWriterPool.Get().(*gzip.Writer)
		defer gzipWriterPool.Put(gzipWriter)

		gzipWriter.Reset(c.Writer)
		defer gzipWriter.Close()

		// Wrap response writer
		c.Writer = &gzipResponseWriter{
			ResponseWriter: c.Writer,
			Writer:         gzipWriter,
		}

		// Set headers
		c.Header("Content-Encoding", "gzip")
		c.Header("Vary", "Accept-Encoding")

		c.Next()
	}
}

type gzipResponseWriter struct {
	gin.ResponseWriter
	Writer io.Writer
}

func (g *gzipResponseWriter) Write(data []byte) (int, error) {
	// Only compress if response is large enough
	if len(data) < minCompressionSize {
		return g.ResponseWriter.Write(data)
	}

	return g.Writer.Write(data)
}

func shouldNotCompress(contentType string) bool {
	// Already compressed formats
	noCompress := []string{
		"image/jpeg",
		"image/png",
		"image/gif",
		"video/mp4",
		"video/webm",
		"audio/mpeg",
		"audio/ogg",
		"application/zip",
		"application/gzip",
	}

	for _, ct := range noCompress {
		if strings.Contains(contentType, ct) {
			return true
		}
	}

	return false
}

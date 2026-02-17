package middleware

import (
	"bytes"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// SecurityHeaders adds security headers to all responses
// Implements OWASP security best practices
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Content Security Policy (CSP)
		// Prevents XSS attacks by controlling resource loading
		csp := []string{
			"default-src 'self'",                              // Only load from same origin by default
			"script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Allow scripts (unsafe-inline needed for React, unsafe-eval for development)
			"style-src 'self' 'unsafe-inline'",                // Allow styles (unsafe-inline needed for styled-components)
			"img-src 'self' data: blob: https:",               // Allow images from self, data URLs, blobs, HTTPS
			"font-src 'self' data:",                           // Allow fonts from self and data URLs
			"connect-src 'self' ws: wss:",                     // Allow WebSocket connections
			"media-src 'self' blob:",                          // Allow media from self and blobs
			"object-src 'none'",                               // Block plugins (Flash, etc.)
			"frame-ancestors 'none'",                          // Prevent clickjacking
			"base-uri 'self'",                                 // Restrict <base> tag
			"form-action 'self'",                              // Only submit forms to same origin
			"upgrade-insecure-requests",                       // Upgrade HTTP to HTTPS
		}
		c.Header("Content-Security-Policy", strings.Join(csp, "; "))

		// X-Frame-Options: Prevent clickjacking
		// DENY = cannot be embedded in any frame
		c.Header("X-Frame-Options", "DENY")

		// X-Content-Type-Options: Prevent MIME sniffing
		// nosniff = browsers must respect Content-Type header
		c.Header("X-Content-Type-Options", "nosniff")

		// X-XSS-Protection: Enable browser XSS filter
		// 1; mode=block = enable XSS filter and block page if attack detected
		c.Header("X-XSS-Protection", "1; mode=block")

		// Strict-Transport-Security (HSTS): Force HTTPS
		// max-age=31536000 = 1 year
		// includeSubDomains = apply to all subdomains
		// preload = submit to browser preload list
		c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")

		// Referrer-Policy: Control referrer information
		// strict-origin-when-cross-origin = send full URL for same-origin, origin only for cross-origin HTTPS, nothing for HTTP
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")

		// Permissions-Policy: Control browser features
		// Disable unnecessary features to reduce attack surface
		permissions := []string{
			"camera=(self)",     // Camera only for same origin
			"microphone=(self)", // Microphone only for same origin (voice messages)
			"geolocation=()",    // Disable geolocation
			"payment=()",        // Disable payment API
			"usb=()",            // Disable USB access
			"magnetometer=()",   // Disable magnetometer
			"gyroscope=()",      // Disable gyroscope
			"accelerometer=()",  // Disable accelerometer
		}
		c.Header("Permissions-Policy", strings.Join(permissions, ", "))

		c.Next()
	}
}

// CSRF token middleware
// Validates CSRF tokens for state-changing operations (POST, PUT, DELETE, PATCH)
func CSRFProtection() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip CSRF for safe methods (GET, HEAD, OPTIONS)
		if c.Request.Method == "GET" || c.Request.Method == "HEAD" || c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		// Skip CSRF for WebSocket upgrade requests
		if c.GetHeader("Upgrade") == "websocket" {
			c.Next()
			return
		}

		// Get CSRF token from header
		token := c.GetHeader("X-CSRF-Token")
		if token == "" {
			// Fallback to form field
			token = c.PostForm("csrf_token")
		}

		// Validate token
		// Note: This is a placeholder. In production, implement proper CSRF token validation
		// using a library like gorilla/csrf or implement your own token generation/validation
		if token == "" {
			c.JSON(403, gin.H{
				"error": "CSRF token missing",
				"code":  "CSRF_TOKEN_MISSING",
			})
			c.Abort()
			return
		}

		// TODO: Implement actual token validation
		// For now, we'll accept any non-empty token
		// In production:
		// 1. Generate token on login (store in session)
		// 2. Include token in responses (cookie or JSON)
		// 3. Validate token matches session token

		c.Next()
	}
}

// SanitizeInput sanitizes user input to prevent XSS attacks
// This is a basic implementation - for production, use a library like bluemonday
func SanitizeInput(input string) string {
	// Remove common XSS patterns
	replacements := map[string]string{
		"<script":     "&lt;script",
		"</script>":   "&lt;/script&gt;",
		"javascript:": "",
		"onerror=":    "",
		"onload=":     "",
		"onclick=":    "",
		"<iframe":     "&lt;iframe",
		"</iframe>":   "&lt;/iframe&gt;",
	}

	sanitized := input
	for pattern, replacement := range replacements {
		sanitized = strings.ReplaceAll(sanitized, pattern, replacement)
		// Also check uppercase variants
		sanitized = strings.ReplaceAll(sanitized, strings.ToUpper(pattern), replacement)
	}

	return sanitized
}

// ValidateMIMEType checks if a file's MIME type is allowed
func ValidateMIMEType(mimeType string, allowedTypes []string) bool {
	for _, allowed := range allowedTypes {
		if mimeType == allowed {
			return true
		}
		// Support wildcard matching (e.g., "image/*")
		if strings.HasSuffix(allowed, "/*") {
			prefix := strings.TrimSuffix(allowed, "/*")
			if strings.HasPrefix(mimeType, prefix+"/") {
				return true
			}
		}
	}
	return false
}

// AllowedMediaTypes defines allowed MIME types for media uploads
var AllowedMediaTypes = []string{
	// Images
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
	// Documents
	"application/pdf",
	// Audio
	"audio/mpeg", // MP3
	"audio/mp4",  // M4A
	"audio/ogg",  // OGG
	"audio/wav",  // WAV
	"audio/webm", // WebM audio
	"audio/opus", // Opus
	// Video
	"video/mp4",
	"video/webm",
	"video/quicktime",  // MOV
	"video/x-matroska", // MKV
}

// AllowedFileExtensions defines allowed file extensions for uploads.
var AllowedFileExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".gif":  true,
	".webp": true,
	".mp3":  true,
	".m4a":  true,
	".ogg":  true,
	".wav":  true,
	".webm": true,
	".opus": true,
	".mp4":  true,
	".mov":  true,
	".mkv":  true,
	".pdf":  true,
}

var extensionToAllowedMIMEs = map[string][]string{
	".jpg":  {"image/jpeg"},
	".jpeg": {"image/jpeg"},
	".png":  {"image/png"},
	".gif":  {"image/gif"},
	".webp": {"image/webp"},
	".mp3":  {"audio/mpeg"},
	".m4a":  {"audio/mp4"},
	".ogg":  {"audio/ogg"},
	".wav":  {"audio/wav"},
	".webm": {"audio/webm", "video/webm"},
	".opus": {"audio/opus"},
	".mp4":  {"video/mp4"},
	".mov":  {"video/quicktime"},
	".mkv":  {"video/x-matroska"},
	".pdf":  {"application/pdf"},
}

// ValidateFileExtension checks whether the filename extension is allowed.
func ValidateFileExtension(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	return AllowedFileExtensions[ext]
}

// ValidateExtensionMatchesMIME ensures extension and detected MIME are consistent.
func ValidateExtensionMatchesMIME(filename, mimeType string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	allowedMIMEs, ok := extensionToAllowedMIMEs[ext]
	if !ok {
		return false
	}
	for _, allowed := range allowedMIMEs {
		if mimeType == allowed {
			return true
		}
	}
	return false
}

// ValidateNoSuspiciousSignatures performs lightweight polyglot detection.
// It rejects files that contain embedded ZIP signatures while claiming a non-archive MIME.
func ValidateNoSuspiciousSignatures(head []byte, mimeType string) bool {
	if strings.HasPrefix(mimeType, "image/") ||
		strings.HasPrefix(mimeType, "audio/") ||
		strings.HasPrefix(mimeType, "video/") ||
		mimeType == "application/pdf" {
		if bytes.Contains(head, []byte("PK\x03\x04")) {
			return false
		}
	}
	return true
}

// MaxUploadSizes defines max file sizes by type (in bytes)
var MaxUploadSizes = map[string]int64{
	"image/*":         10 * 1024 * 1024,  // 10 MB for images
	"video/*":         100 * 1024 * 1024, // 100 MB for videos
	"audio/*":         10 * 1024 * 1024,  // 10 MB for voice/audio uploads
	"application/pdf": 25 * 1024 * 1024,  // 25 MB for documents
}

// GetMaxSizeForMIME returns the max allowed size for a MIME type
func GetMaxSizeForMIME(mimeType string) int64 {
	// Check exact match first
	if size, ok := MaxUploadSizes[mimeType]; ok {
		return size
	}

	// Check wildcard match
	parts := strings.Split(mimeType, "/")
	if len(parts) == 2 {
		wildcard := parts[0] + "/*"
		if size, ok := MaxUploadSizes[wildcard]; ok {
			return size
		}
	}

	// Default: 10 MB
	return 10 * 1024 * 1024
}

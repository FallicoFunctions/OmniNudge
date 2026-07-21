package middleware

import (
	"archive/zip"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// CSRF is mitigated by the JWT Authorization header pattern — cross-origin
// requests cannot set custom Authorization headers without CORS permission. If
// cookie-based auth is ever introduced, implement double-submit cookie CSRF
// protection at that time.

// SecurityHeaders adds security headers to all responses
// Implements OWASP security best practices
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		scriptSrc := "'self' 'unsafe-inline' 'unsafe-eval'"
		if os.Getenv("APP_ENV") == "production" {
			scriptSrc = "'self' 'unsafe-inline'"
		}
		// Content Security Policy (CSP)
		// Prevents XSS attacks by controlling resource loading
		csp := []string{
			"default-src 'self'",                                   // Only load from same origin by default
			"script-src " + scriptSrc,                              // Allow eval only outside production for development tooling
			"style-src 'self' 'unsafe-inline'",                     // Allow styles (unsafe-inline needed for styled-components)
			"img-src 'self' data: blob: https:",                    // Allow images from self, data URLs, blobs, HTTPS
			"font-src 'self' data:",                                // Allow fonts from self and data URLs
			"connect-src 'self' ws: wss:",                          // Allow WebSocket connections
			"media-src 'self' blob: https:",                        // Allow media from self, blobs, and HTTPS CDN redirects
			"frame-src 'self' https://daily.co https://*.daily.co", // Private Tavus/Daily live-avatar rooms
			"object-src 'none'",                                    // Block plugins (Flash, etc.)
			"frame-ancestors 'none'",                               // Prevent clickjacking
			"base-uri 'self'",                                      // Restrict <base> tag
			"form-action 'self'",                                   // Only submit forms to same origin
			"upgrade-insecure-requests",                            // Upgrade HTTP to HTTPS
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
			`camera=(self "https://daily.co" "https://*.daily.co")`,     // Same-origin calls and trusted Tavus/Daily rooms
			`microphone=(self "https://daily.co" "https://*.daily.co")`, // Same-origin voice and trusted Tavus/Daily rooms
			"geolocation=()",   // Disable geolocation
			"payment=()",       // Disable payment API
			"usb=()",           // Disable USB access
			"magnetometer=()",  // Disable magnetometer
			"gyroscope=()",     // Disable gyroscope
			"accelerometer=()", // Disable accelerometer
		}
		c.Header("Permissions-Policy", strings.Join(permissions, ", "))

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
	mimeType = normalizeMIMEType(mimeType)
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
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"text/plain",
	"application/zip",
	"application/x-zip-compressed",
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
	".doc":  true,
	".docx": true,
	".txt":  true,
	".zip":  true,
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
	".doc":  {"application/msword"},
	".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/x-zip-compressed"},
	".txt":  {"text/plain"},
	".zip":  {"application/zip", "application/x-zip-compressed"},
}

// ValidateFileExtension checks whether the filename extension is allowed.
func ValidateFileExtension(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	return AllowedFileExtensions[ext]
}

// ValidateExtensionMatchesMIME ensures extension and detected MIME are consistent.
func ValidateExtensionMatchesMIME(filename, mimeType string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	mimeType = normalizeMIMEType(mimeType)
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
	mimeType = normalizeMIMEType(mimeType)
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
	"image/*": 10 * 1024 * 1024,  // 10 MB for images
	"video/*": 100 * 1024 * 1024, // 100 MB for videos
	"audio/*": 10 * 1024 * 1024,  // 10 MB for voice/audio uploads
	// 25 MB for document/archive types
	"application/pdf":    25 * 1024 * 1024,
	"application/msword": 25 * 1024 * 1024,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": 25 * 1024 * 1024,
	"text/plain":                   25 * 1024 * 1024,
	"application/zip":              25 * 1024 * 1024,
	"application/x-zip-compressed": 25 * 1024 * 1024,
}

// GetMaxSizeForMIME returns the max allowed size for a MIME type
func GetMaxSizeForMIME(mimeType string) int64 {
	mimeType = normalizeMIMEType(mimeType)
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

// NormalizeDetectedMIME maps generic detector outputs to safe, extension-aware MIME types.
func NormalizeDetectedMIME(filename, mimeType string) string {
	normalized := normalizeMIMEType(mimeType)
	ext := strings.ToLower(filepath.Ext(filename))

	switch ext {
	case ".doc":
		if normalized == "application/octet-stream" {
			return "application/msword"
		}
	case ".docx":
		if normalized == "application/zip" || normalized == "application/x-zip-compressed" {
			return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
		}
	case ".zip":
		if normalized == "application/octet-stream" {
			return "application/zip"
		}
	}

	return normalized
}

func normalizeMIMEType(mimeType string) string {
	normalized := strings.TrimSpace(strings.ToLower(mimeType))
	if semi := strings.Index(normalized, ";"); semi >= 0 {
		normalized = strings.TrimSpace(normalized[:semi])
	}
	return normalized
}

var (
	oleCompoundMagic  = []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1}
	docxRequiredFiles = []string{
		"[Content_Types].xml",
		"_rels/.rels",
		"word/document.xml",
	}
)

// ValidateStrictDocumentStructure enforces genuine office document structure.
func ValidateStrictDocumentStructure(filePath, filename, mimeType string, head []byte) error {
	mimeType = normalizeMIMEType(mimeType)
	ext := strings.ToLower(filepath.Ext(filename))

	isDoc := ext == ".doc" || mimeType == "application/msword"
	isDocx := ext == ".docx" || mimeType == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	if !isDoc && !isDocx {
		return nil
	}

	if isDoc {
		if len(head) < len(oleCompoundMagic) || !bytes.Equal(head[:len(oleCompoundMagic)], oleCompoundMagic) {
			return fmt.Errorf("invalid .doc file signature")
		}
		return nil
	}

	if len(head) < 4 || !bytes.Equal(head[:4], []byte{'P', 'K', 0x03, 0x04}) {
		return fmt.Errorf("invalid .docx file signature")
	}

	reader, err := zip.OpenReader(filePath)
	if err != nil {
		return fmt.Errorf("invalid .docx zip container: %w", err)
	}
	defer reader.Close()

	found := make(map[string]bool, len(reader.File))
	for _, f := range reader.File {
		found[f.Name] = true
	}
	for _, required := range docxRequiredFiles {
		if !found[required] {
			return fmt.Errorf("invalid .docx missing required entry: %s", required)
		}
	}

	return nil
}

// Package validation provides input validation and sanitization helpers used
// across HTTP handlers.
//
// Function guide:
//   - StripHTML: removes HTML tags using a regex. Safe for storing plain text;
//     NOT safe for preventing XSS when the result is rendered as HTML.
//   - SanitizeHTML: HTML-entity-encodes the five special characters (<, >, &, ", ').
//     Use this when you must embed user input inside an HTML document.
//   - Sanitize: strips null bytes and control characters. Use it on general
//     text input that must be stored as plain UTF-8 without control characters.
//   - NoXSS / NoSQLInjection: heuristic keyword checks only. They are NOT a
//     security guarantee — parameterised queries and context-aware output
//     encoding are the real defences. Use these only as a secondary signal.
package validation

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// htmlTagRegex matches any HTML/XML tag so that StripHTML can remove them.
var htmlTagRegex = regexp.MustCompile(`<[^>]*>`)

// Common validation patterns
var (
	// Email regex (RFC 5322 simplified)
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

	// Username: 3-30 chars, alphanumeric + underscore/hyphen
	usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{3,30}$`)

	// Hub name: 3-50 chars, alphanumeric + underscore/hyphen
	hubNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{3,50}$`)

	// Hex color: #RRGGBB or #RRGGBBAA
	hexColorRegex = regexp.MustCompile(`^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$`)

	// URL: http(s) scheme followed by an IP address or hostname, optional port,
	// path, query string, and fragment.  Accepts bare hosts (no path required).
	//
	// The hostname pattern requires at least two characters — the leading
	// [a-zA-Z0-9] plus [a-zA-Z0-9.-]*[a-zA-Z0-9] means both anchors must
	// match, making single-character bare hostnames (e.g. "http://a") invalid.
	// Note: IP address octet range (0-255) is not validated by this regex;
	// use net.ParseIP for strict IP validation.
	urlRegex = regexp.MustCompile(`^https?://(\d{1,3}(\.\d{1,3}){3}|[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9])(?::\d+)?(/[^\s]*)?(\?[^\s]*)?(#[^\s]*)?$`)
)

// ValidationError represents a validation error
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return e.Field + ": " + e.Message
}

// Validator provides common input validation functions
type Validator struct {
	errors []ValidationError
}

// NewValidator creates a new validator
func NewValidator() *Validator {
	return &Validator{
		errors: []ValidationError{},
	}
}

// HasErrors returns true if there are validation errors
func (v *Validator) HasErrors() bool {
	return len(v.errors) > 0
}

// Errors returns all validation errors
func (v *Validator) Errors() []ValidationError {
	return v.errors
}

// AddError adds a validation error
func (v *Validator) AddError(field, message string) {
	v.errors = append(v.errors, ValidationError{Field: field, Message: message})
}

// Required checks if a string is not empty
func (v *Validator) Required(field, value string) bool {
	if strings.TrimSpace(value) == "" {
		v.AddError(field, "is required")
		return false
	}
	return true
}

// Email validates an email address
func (v *Validator) Email(field, value string) bool {
	if value == "" {
		return true // Use Required() separately if needed
	}
	if !emailRegex.MatchString(value) {
		v.AddError(field, "must be a valid email address")
		return false
	}
	return true
}

// Username validates a username
func (v *Validator) Username(field, value string) bool {
	if value == "" {
		return true
	}
	if !usernameRegex.MatchString(value) {
		v.AddError(field, "must be 3-30 characters, alphanumeric with underscores/hyphens only")
		return false
	}
	return true
}

// HubName validates a hub name
func (v *Validator) HubName(field, value string) bool {
	if value == "" {
		return true
	}
	if !hubNameRegex.MatchString(value) {
		v.AddError(field, "must be 3-50 characters, alphanumeric with underscores/hyphens only")
		return false
	}
	return true
}

// MinLength validates minimum string length
func (v *Validator) MinLength(field, value string, min int) bool {
	if value == "" {
		return true
	}
	if utf8.RuneCountInString(value) < min {
		v.AddError(field, "must be at least "+strconv.Itoa(min)+" characters")
		return false
	}
	return true
}

// MaxLength validates maximum string length
func (v *Validator) MaxLength(field, value string, max int) bool {
	if value == "" {
		return true
	}
	if utf8.RuneCountInString(value) > max {
		v.AddError(field, "must be at most "+strconv.Itoa(max)+" characters")
		return false
	}
	return true
}

// MinValue validates minimum integer value
func (v *Validator) MinValue(field string, value, min int) bool {
	if value < min {
		v.AddError(field, "must be at least "+strconv.Itoa(min))
		return false
	}
	return true
}

// MaxValue validates maximum integer value
func (v *Validator) MaxValue(field string, value, max int) bool {
	if value > max {
		v.AddError(field, "must be at most "+strconv.Itoa(max))
		return false
	}
	return true
}

// InRange validates that a value is within a range
func (v *Validator) InRange(field string, value, min, max int) bool {
	if value < min || value > max {
		v.AddError(field, "must be between "+strconv.Itoa(min)+" and "+strconv.Itoa(max))
		return false
	}
	return true
}

// HexColor validates a hex color code
func (v *Validator) HexColor(field, value string) bool {
	if value == "" {
		return true
	}
	if !hexColorRegex.MatchString(value) {
		v.AddError(field, "must be a valid hex color (#RRGGBB or #RRGGBBAA)")
		return false
	}
	return true
}

// URL validates a URL
func (v *Validator) URL(field, value string) bool {
	if value == "" {
		return true
	}
	if !urlRegex.MatchString(value) {
		v.AddError(field, "must be a valid URL")
		return false
	}
	return true
}

// OneOf validates that a value is one of allowed values
func (v *Validator) OneOf(field, value string, allowed []string) bool {
	if value == "" {
		return true
	}
	for _, a := range allowed {
		if value == a {
			return true
		}
	}
	v.AddError(field, "must be one of: "+strings.Join(allowed, ", "))
	return false
}

// NoXSS checks for common XSS patterns.
//
// SECURITY NOTE: This is a heuristic keyword check only. It is NOT a security
// guarantee — it can be bypassed with encoding tricks or novel payloads.
// The real XSS defence is context-aware output encoding (use SanitizeHTML for
// HTML output) and a Content-Security-Policy header. Do not rely solely on
// this function to prevent XSS.
func (v *Validator) NoXSS(field, value string) bool {
	if value == "" {
		return true
	}

	// Check for dangerous patterns
	dangerous := []string{
		"<script",
		"</script>",
		"javascript:",
		"onerror=",
		"onload=",
		"onclick=",
		"<iframe",
		"</iframe>",
		"eval(",
		"document.cookie",
	}

	lowerValue := strings.ToLower(value)
	for _, pattern := range dangerous {
		if strings.Contains(lowerValue, pattern) {
			v.AddError(field, "contains potentially dangerous content")
			return false
		}
	}

	return true
}

// NoSQLInjection checks for common SQL injection patterns.
//
// SECURITY NOTE: This is a heuristic keyword check only. It is NOT a security
// guarantee — it can be bypassed with obfuscation and does not cover all attack
// vectors. The real defence against SQL injection is parameterised queries
// (never string-interpolated SQL). Do not rely solely on this function to
// prevent SQL injection.
func (v *Validator) NoSQLInjection(field, value string) bool {
	if value == "" {
		return true
	}

	// Check for SQL injection patterns.
	// NOTE: "UPDATE" and "--" are intentionally omitted: they are common in
	// legitimate user content (e.g. changelogs, SQL documentation, markdown
	// comments) and produce false positives. Parameterized queries are the
	// real defence against SQL injection; these patterns are only a secondary
	// heuristic signal for unambiguously malicious constructs.
	dangerous := []string{
		";--",
		"';",
		"\";",
		"' OR '",
		"\" OR \"",
		"' AND '",
		"\" AND \"",
		"UNION SELECT",
		"DROP TABLE",
		"DELETE FROM",
		"INSERT INTO",
		"EXEC(",
		"EXECUTE(",
	}

	upperValue := strings.ToUpper(value)
	for _, pattern := range dangerous {
		if strings.Contains(upperValue, pattern) {
			v.AddError(field, "contains potentially dangerous SQL patterns")
			return false
		}
	}

	return true
}

// Sanitize removes potentially dangerous characters from input.
// It strips null bytes and control characters (other than newline, tab, and
// carriage return).  For HTML output encoding, use SanitizeHTML instead.
func Sanitize(input string) string {
	// Remove null bytes
	input = strings.ReplaceAll(input, "\x00", "")

	// Remove control characters except newline, tab, carriage return
	cleaned := strings.Builder{}
	for _, r := range input {
		if r >= 32 || r == '\n' || r == '\t' || r == '\r' {
			cleaned.WriteRune(r)
		}
	}

	return cleaned.String()
}

// StripHTML removes all HTML tags from s using a regex, providing basic
// plaintext extraction.
//
// IMPORTANT: This is NOT safe for preventing XSS when the output is later
// rendered as HTML, because it does not HTML-encode the remaining text.
// Use SanitizeHTML when you need to embed user input inside an HTML document.
func StripHTML(s string) string {
	return htmlTagRegex.ReplaceAllString(s, "")
}

// ValidateRequestSize returns an error when len(body) exceeds maxBytes.
// Use this as an early guard in handlers that read the entire request body
// before processing it.
func ValidateRequestSize(body []byte, maxBytes int) error {
	if len(body) > maxBytes {
		return fmt.Errorf("request body size %d exceeds limit of %d bytes", len(body), maxBytes)
	}
	return nil
}

// SanitizeHTML HTML-entity-encodes the five characters that have special
// meaning in HTML: &, <, >, ", '.  & is replaced first to prevent
// double-encoding the other replacements.
//
// Use this function when you must embed user-supplied text inside an HTML
// document.  For stripping tags entirely, use StripHTML.
func SanitizeHTML(s string) string {
	// & must be replaced first to avoid double-encoding other replacements.
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&#39;",
	)
	return r.Replace(s)
}

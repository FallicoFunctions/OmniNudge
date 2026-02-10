package validation

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

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

	// URL: https:// or http://
	urlRegex = regexp.MustCompile(`^https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(/.*)?$`)
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
		v.AddError(field, "must be at least "+string(rune('0'+min))+" characters")
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
		v.AddError(field, "must be at most "+string(rune('0'+max))+" characters")
		return false
	}
	return true
}

// MinValue validates minimum integer value
func (v *Validator) MinValue(field string, value, min int) bool {
	if value < min {
		v.AddError(field, "must be at least "+string(rune('0'+min)))
		return false
	}
	return true
}

// MaxValue validates maximum integer value
func (v *Validator) MaxValue(field string, value, max int) bool {
	if value > max {
		v.AddError(field, "must be at most "+string(rune('0'+max)))
		return false
	}
	return true
}

// InRange validates that a value is within a range
func (v *Validator) InRange(field string, value, min, max int) bool {
	if value < min || value > max {
		v.AddError(field, "must be between "+string(rune('0'+min))+" and "+string(rune('0'+max)))
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

// NoXSS checks for common XSS patterns
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

// NoSQLInjection checks for common SQL injection patterns
func (v *Validator) NoSQLInjection(field, value string) bool {
	if value == "" {
		return true
	}

	// Check for SQL injection patterns
	dangerous := []string{
		"--",
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
		"UPDATE ",
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

// Sanitize removes potentially dangerous characters from input
// Note: This is a basic implementation. For production HTML sanitization,
// use a library like bluemonday
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

// SanitizeHTML provides basic HTML sanitization
// For production, use bluemonday library
func SanitizeHTML(input string) string {
	replacements := map[string]string{
		"<":  "&lt;",
		">":  "&gt;",
		"\"": "&quot;",
		"'":  "&#39;",
		"&":  "&amp;",
	}

	sanitized := input
	for old, new := range replacements {
		sanitized = strings.ReplaceAll(sanitized, old, new)
	}

	return sanitized
}

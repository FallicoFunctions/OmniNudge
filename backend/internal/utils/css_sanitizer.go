package utils

import (
	"regexp"
	"strings"
)

// CSSSanitizer provides CSS sanitization to prevent XSS attacks
type CSSSanitizer struct {
	// Dangerous patterns that should be blocked
	dangerousPatterns []*regexp.Regexp
}

// NewCSSSanitizer creates a new CSS sanitizer
func NewCSSSanitizer() *CSSSanitizer {
	return &CSSSanitizer{
		dangerousPatterns: []*regexp.Regexp{
			// Block javascript: URLs
			regexp.MustCompile(`(?i)javascript\s*:`),
			// Block data: URLs (can contain scripts)
			regexp.MustCompile(`(?i)data\s*:`),
			// Block vbscript: URLs
			regexp.MustCompile(`(?i)vbscript\s*:`),
			// Block expression() - IE CSS expressions
			regexp.MustCompile(`(?i)expression\s*\(`),
			// Block behavior: URLs - IE specific
			regexp.MustCompile(`(?i)behavior\s*:`),
			// Block -moz-binding (Firefox XBL)
			regexp.MustCompile(`(?i)-moz-binding\s*:`),
			// Block @import statements (can load external CSS)
			regexp.MustCompile(`(?i)@import`),
			// Block @charset (shouldn't be in scoped CSS)
			regexp.MustCompile(`(?i)@charset`),
			// Block @namespace (shouldn't be in scoped CSS)
			regexp.MustCompile(`(?i)@namespace`),
			// Block HTML comments that could break out of style tag
			regexp.MustCompile(`<!--`),
			regexp.MustCompile(`-->`),
			// Block script tags
			regexp.MustCompile(`(?i)<script`),
			regexp.MustCompile(`(?i)</script>`),
			// Block style tag closures
			regexp.MustCompile(`(?i)</style>`),
		},
	}
}

// Sanitize cleans CSS content and returns sanitized CSS or error
func (s *CSSSanitizer) Sanitize(css string) (string, error) {
	// Remove any null bytes
	css = strings.ReplaceAll(css, "\x00", "")

	// Check for dangerous patterns
	for _, pattern := range s.dangerousPatterns {
		if pattern.MatchString(css) {
			return "", &SanitizationError{
				Message: "CSS contains forbidden pattern: " + pattern.String(),
			}
		}
	}

	// Additional validation: ensure balanced braces
	if !s.hasBalancedBraces(css) {
		return "", &SanitizationError{
			Message: "CSS has unbalanced braces",
		}
	}

	return css, nil
}

// hasBalancedBraces checks if CSS has balanced curly braces
func (s *CSSSanitizer) hasBalancedBraces(css string) bool {
	count := 0
	inString := false
	escapeNext := false

	for i := 0; i < len(css); i++ {
		char := css[i]

		if escapeNext {
			escapeNext = false
			continue
		}

		if char == '\\' {
			escapeNext = true
			continue
		}

		// Track string boundaries (both ' and ")
		if (char == '\'' || char == '"') && !escapeNext {
			// Only toggle if we're starting a string or ending the same type
			if !inString {
				inString = true
			} else {
				inString = false
			}
			continue
		}

		// Only count braces outside of strings
		if !inString {
			if char == '{' {
				count++
			} else if char == '}' {
				count--
				if count < 0 {
					return false
				}
			}
		}
	}

	return count == 0
}

// GenerateScopedCSS wraps CSS selectors to scope them to a specific container
func (s *CSSSanitizer) GenerateScopedCSS(css string, scope string) (string, error) {
	// First sanitize the CSS
	sanitized, err := s.Sanitize(css)
	if err != nil {
		return "", err
	}

	// Simple scoping: prepend the scope to each selector
	// This is a basic implementation - a full CSS parser would be more robust
	lines := strings.Split(sanitized, "\n")
	var result strings.Builder

	inRule := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Skip empty lines and comments
		if trimmed == "" || strings.HasPrefix(trimmed, "/*") {
			result.WriteString(line)
			result.WriteString("\n")
			continue
		}

		// Handle @media, @keyframes, etc. (preserve as-is)
		if strings.HasPrefix(trimmed, "@") {
			result.WriteString(line)
			result.WriteString("\n")
			continue
		}

		// Check if this line starts a rule (contains {)
		if strings.Contains(line, "{") && !inRule {
			inRule = true
			parts := strings.SplitN(line, "{", 2)
			selector := strings.TrimSpace(parts[0])

			// Scope the selector
			scopedSelector := s.scopeSelector(selector, scope)
			result.WriteString(scopedSelector)
			result.WriteString(" { ")
			if len(parts) > 1 {
				result.WriteString(parts[1])
			}
			result.WriteString("\n")
			continue
		}

		// Check if this line ends a rule (contains })
		if strings.Contains(line, "}") && inRule {
			inRule = false
		}

		result.WriteString(line)
		result.WriteString("\n")
	}

	return result.String(), nil
}

// scopeSelector adds scope prefix to a CSS selector
func (s *CSSSanitizer) scopeSelector(selector string, scope string) string {
	// Split multiple selectors (comma-separated)
	selectors := strings.Split(selector, ",")
	var scoped []string

	for _, sel := range selectors {
		sel = strings.TrimSpace(sel)
		if sel == "" {
			continue
		}

		// If selector already starts with the scope, don't add it again
		if strings.HasPrefix(sel, scope) {
			scoped = append(scoped, sel)
		} else {
			// Add scope prefix
			scoped = append(scoped, scope+" "+sel)
		}
	}

	return strings.Join(scoped, ", ")
}

// SanitizationError represents a CSS sanitization error
type SanitizationError struct {
	Message string
}

func (e *SanitizationError) Error() string {
	return e.Message
}

package services

import (
	"errors"
	"regexp"
	"strings"
)

// CSSSanitizer provides CSS validation and sanitization to prevent XSS attacks.
type CSSSanitizer struct {
	// Compiled regex patterns for dangerous CSS
	urlPattern        *regexp.Regexp
	importPattern     *regexp.Regexp
	jsProtocolPattern *regexp.Regexp
	expressionPattern *regexp.Regexp
	behaviorPattern   *regexp.Regexp
	bindingPattern    *regexp.Regexp
	vbscriptPattern   *regexp.Regexp
	htmlTagPattern    *regexp.Regexp
}

// NewCSSSanitizer creates a new CSS sanitizer with compiled patterns.
func NewCSSSanitizer() *CSSSanitizer {
	return &CSSSanitizer{
		// Block all url() functions (prevents external resource loading, tracking pixels, data exfiltration)
		urlPattern: regexp.MustCompile(`(?i)url\s*\(`),

		// Block @import statements (prevents loading external stylesheets)
		importPattern: regexp.MustCompile(`(?i)@import`),

		// Block JavaScript protocol (javascript:, vbscript:)
		jsProtocolPattern: regexp.MustCompile(`(?i)javascript\s*:`),
		vbscriptPattern:   regexp.MustCompile(`(?i)vbscript\s*:`),

		// Block IE-specific CSS expressions (legacy IE XSS vector)
		expressionPattern: regexp.MustCompile(`(?i)expression\s*\(`),

		// Block IE-specific behavior property
		behaviorPattern: regexp.MustCompile(`(?i)behavior\s*:`),

		// Block Mozilla-specific binding (XBL injection)
		bindingPattern: regexp.MustCompile(`(?i)-moz-binding\s*:`),

		// Block HTML tags (prevent breaking out of style context)
		htmlTagPattern: regexp.MustCompile(`<[^>]*>`),
	}
}

// Sanitize validates and sanitizes user-provided CSS.
// Returns an error if dangerous patterns are detected.
func (s *CSSSanitizer) Sanitize(css string) error {
	if css == "" {
		return nil
	}

	// Trim whitespace
	css = strings.TrimSpace(css)

	// Check for HTML tags (attempt to break out of <style> context)
	if s.htmlTagPattern.MatchString(css) {
		return errors.New("CSS contains HTML tags")
	}

	// Check for url() function
	if s.urlPattern.MatchString(css) {
		return errors.New("CSS contains forbidden url() function - external resources not allowed")
	}

	// Check for @import statements
	if s.importPattern.MatchString(css) {
		return errors.New("CSS contains forbidden @import statement")
	}

	// Check for JavaScript protocol
	if s.jsProtocolPattern.MatchString(css) {
		return errors.New("CSS contains forbidden javascript: protocol")
	}

	if s.vbscriptPattern.MatchString(css) {
		return errors.New("CSS contains forbidden vbscript: protocol")
	}

	// Check for CSS expressions (IE)
	if s.expressionPattern.MatchString(css) {
		return errors.New("CSS contains forbidden expression() - IE-specific XSS vector")
	}

	// Check for behavior property (IE)
	if s.behaviorPattern.MatchString(css) {
		return errors.New("CSS contains forbidden behavior property")
	}

	// Check for -moz-binding (Mozilla XBL)
	if s.bindingPattern.MatchString(css) {
		return errors.New("CSS contains forbidden -moz-binding property")
	}

	// Check for balanced braces (prevent CSS injection)
	if !s.hasBalancedBraces(css) {
		return errors.New("CSS has unbalanced braces - possible injection attempt")
	}

	// Check CSS size limit (prevent DoS via large CSS)
	const maxCSSSize = 100 * 1024 // 100KB
	if len(css) > maxCSSSize {
		return errors.New("CSS exceeds maximum size of 100KB")
	}

	return nil
}

// hasBalancedBraces checks if CSS has balanced { } braces.
func (s *CSSSanitizer) hasBalancedBraces(css string) bool {
	openBraces := strings.Count(css, "{")
	closeBraces := strings.Count(css, "}")
	return openBraces == closeBraces
}

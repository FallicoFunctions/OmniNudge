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

// SanitizeVariables validates CSS variable names and values.
// CSS variables must start with -- and contain only safe characters.
func (s *CSSSanitizer) SanitizeVariables(variables map[string]interface{}) error {
	if variables == nil {
		return nil
	}

	validVarName := regexp.MustCompile(`^--[a-zA-Z0-9-_]+$`)

	for key, value := range variables {
		// Validate variable name
		if !validVarName.MatchString(key) {
			return errors.New("invalid CSS variable name: " + key)
		}

		// Convert value to string and validate
		var valueStr string
		switch v := value.(type) {
		case string:
			valueStr = v
		case float64, int:
			// Numbers are safe
			continue
		default:
			return errors.New("invalid CSS variable value type for: " + key)
		}

		// Check for dangerous patterns in variable values
		if s.urlPattern.MatchString(valueStr) {
			return errors.New("CSS variable contains forbidden url() function: " + key)
		}

		if s.jsProtocolPattern.MatchString(valueStr) {
			return errors.New("CSS variable contains forbidden javascript: protocol: " + key)
		}

		if s.htmlTagPattern.MatchString(valueStr) {
			return errors.New("CSS variable contains HTML tags: " + key)
		}
	}

	return nil
}

// StripComments removes CSS comments (/* ... */) from input.
// This helps prevent comment-based obfuscation of malicious code.
func (s *CSSSanitizer) StripComments(css string) string {
	commentPattern := regexp.MustCompile(`/\*.*?\*/`)
	return commentPattern.ReplaceAllString(css, "")
}

// NormalizeWhitespace reduces multiple whitespace to single spaces.
// This helps with pattern matching and reduces CSS size.
func (s *CSSSanitizer) NormalizeWhitespace(css string) string {
	// Replace multiple whitespace with single space
	whitespacePattern := regexp.MustCompile(`\s+`)
	css = whitespacePattern.ReplaceAllString(css, " ")

	// Trim leading/trailing whitespace
	return strings.TrimSpace(css)
}

// ValidateAndNormalize performs full sanitization pipeline.
// Returns normalized CSS or error if dangerous patterns detected.
func (s *CSSSanitizer) ValidateAndNormalize(css string) (string, error) {
	if css == "" {
		return "", nil
	}

	// Strip comments first (prevent obfuscation)
	css = s.StripComments(css)

	// Normalize whitespace
	css = s.NormalizeWhitespace(css)

	// Perform security validation
	if err := s.Sanitize(css); err != nil {
		return "", err
	}

	return css, nil
}

// IsValidSelector checks if a CSS selector is safe.
// This is a basic check - full CSS parsing would be more robust.
func (s *CSSSanitizer) IsValidSelector(selector string) bool {
	// Disallow certain characters that could indicate injection
	dangerousChars := []string{"<", ">", "javascript:", "expression(", "behavior:"}

	for _, char := range dangerousChars {
		if strings.Contains(strings.ToLower(selector), char) {
			return false
		}
	}

	return true
}

// GetAllowedProperties returns a whitelist of safe CSS properties.
// This can be used for additional validation if needed.
func (s *CSSSanitizer) GetAllowedProperties() []string {
	return []string{
		// Layout
		"display", "position", "top", "right", "bottom", "left",
		"float", "clear", "overflow", "overflow-x", "overflow-y",
		"z-index", "visibility", "clip", "clip-path",

		// Flexbox
		"flex", "flex-direction", "flex-wrap", "flex-flow",
		"justify-content", "align-items", "align-content", "align-self",
		"flex-grow", "flex-shrink", "flex-basis", "order",

		// Grid
		"grid", "grid-template-columns", "grid-template-rows",
		"grid-template-areas", "grid-column", "grid-row",
		"grid-area", "gap", "row-gap", "column-gap",

		// Box Model
		"width", "height", "min-width", "min-height", "max-width", "max-height",
		"margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
		"padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
		"box-sizing",

		// Borders
		"border", "border-width", "border-style", "border-color",
		"border-top", "border-right", "border-bottom", "border-left",
		"border-radius", "border-collapse", "border-spacing",
		"outline", "outline-width", "outline-style", "outline-color", "outline-offset",

		// Backgrounds
		"background", "background-color", "background-image", "background-position",
		"background-size", "background-repeat", "background-attachment",
		"background-clip", "background-origin",

		// Typography
		"color", "font", "font-family", "font-size", "font-weight", "font-style",
		"font-variant", "line-height", "letter-spacing", "word-spacing",
		"text-align", "text-decoration", "text-indent", "text-transform",
		"text-shadow", "white-space", "word-break", "word-wrap", "overflow-wrap",
		"text-overflow", "vertical-align",

		// Shadows & Effects
		"box-shadow", "opacity", "filter", "backdrop-filter",

		// Transforms & Animations
		"transform", "transform-origin", "transition", "transition-property",
		"transition-duration", "transition-timing-function", "transition-delay",
		"animation", "animation-name", "animation-duration", "animation-timing-function",
		"animation-delay", "animation-iteration-count", "animation-direction",
		"animation-fill-mode", "animation-play-state",

		// Lists
		"list-style", "list-style-type", "list-style-position", "list-style-image",

		// Tables
		"table-layout", "caption-side", "empty-cells",

		// Cursor
		"cursor", "pointer-events",

		// User Interface
		"resize", "user-select",

		// Content
		"content", "quotes",
	}
}

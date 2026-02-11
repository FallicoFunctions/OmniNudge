package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	ContextLanguageKey = "language"
	DefaultLanguage    = "en"
)

// I18nMiddleware detects the user's preferred language
func I18nMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Check query parameter
		lang := c.Query("lang")

		// 2. Check Accept-Language header if no query param
		if lang == "" {
			acceptLang := c.GetHeader("Accept-Language")
			if acceptLang != "" {
				// Simple parsing: get the first part of the first language
				// e.g., "en-US,en;q=0.9,es;q=0.8" -> "en"
				parts := strings.Split(acceptLang, ",")
				if len(parts) > 0 {
					first := strings.Split(parts[0], ";")[0]
					lang = strings.Split(first, "-")[0]
				}
			}
		}

		// Fallback to default
		if lang == "" {
			lang = DefaultLanguage
		}

		// Normalize (simple mapping for supported languages)
		lang = strings.ToLower(strings.TrimSpace(lang))
		supported := map[string]bool{
			"en": true,
			"es": true,
			"ar": true,
		}

		if !supported[lang] {
			lang = DefaultLanguage
		}

		// Set in context
		c.Set(ContextLanguageKey, lang)
		c.Next()
	}
}

// GetLanguage retrieves the detected language from the context
func GetLanguage(c *gin.Context) string {
	if lang, exists := c.Get(ContextLanguageKey); exists {
		return lang.(string)
	}
	return DefaultLanguage
}

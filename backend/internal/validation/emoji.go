package validation

import (
	"unicode"
	"unicode/utf8"
)

const (
	// MaxReactionEmojiChars is the maximum number of Unicode code points
	// accepted for a reaction emoji payload.
	MaxReactionEmojiChars = 10
	// MaxReactionEmojiBytes is the maximum UTF-8 byte length accepted for a
	// reaction emoji payload. This mirrors DB-level octet_length checks.
	MaxReactionEmojiBytes = 100
)

// IsValidReactionEmoji returns true when input is a valid reaction emoji
// payload according to backend business and safety rules.
func IsValidReactionEmoji(s string) bool {
	if len(s) == 0 || len(s) > MaxReactionEmojiBytes {
		return false
	}
	if utf8.RuneCountInString(s) > MaxReactionEmojiChars {
		return false
	}
	if !utf8.ValidString(s) {
		return false
	}

	hasNonASCII := false
	for _, r := range s {
		if r < 32 || unicode.IsSpace(r) {
			return false
		}
		if (r >= 0x202A && r <= 0x202E) || (r >= 0x2066 && r <= 0x2069) {
			return false
		}
		if r >= 0xE0000 && r <= 0xE007F {
			return false
		}
		if r > 127 {
			hasNonASCII = true
		}
	}

	return hasNonASCII
}

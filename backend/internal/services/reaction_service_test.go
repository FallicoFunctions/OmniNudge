package services

import (
	"strings"
	"testing"

	"github.com/omninudge/backend/internal/validation"
	"github.com/stretchr/testify/assert"
)

// ---------------------------------------------------------------------------
// Emoji validation library integration tests
// ---------------------------------------------------------------------------

func TestIsValidReactionEmoji(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		// ── valid emoji ─────────────────────────────────────────────────────
		{name: "thumbs up", input: "👍", want: true},
		{name: "red heart", input: "❤️", want: true},
		{name: "fire", input: "🔥", want: true},
		{name: "celebration", input: "🎉", want: true},
		{name: "face with tears of joy", input: "😂", want: true},
		{name: "checkmark", input: "✅", want: true},
		{name: "ZWJ family sequence", input: "👨‍👩‍👧‍👦", want: true},    // multi-rune ZWJ sequence
		{name: "skin tone modifier", input: "👍🏽", want: true},            // thumb + medium skin tone
		{name: "variation selector", input: "❤\uFE0F", want: true},        // heart + VS-16
		{name: "null bytes (100 control chars)", input: string(make([]byte, 100)), want: false}, // \x00 × 100 — rejected by r < 32 check

		// ── invalid: structural ─────────────────────────────────────────────
		{name: "empty string", input: "", want: false},
		{name: "too many characters (11 code points)", input: strings.Repeat("👍", 11), want: false},
		{name: "too long (101 bytes)", input: strings.Repeat("👍", 26) + "a", want: false}, // > 100 bytes
		{name: "ASCII only — letter", input: "a", want: false},
		{name: "ASCII only — word", input: "hello", want: false},
		{name: "ASCII only — number", input: "1", want: false},
		{name: "ASCII only — space", input: " ", want: false},

		// ── invalid: control characters ─────────────────────────────────────
		{name: "null byte", input: "\x00", want: false},
		{name: "newline", input: "\n", want: false},
		{name: "tab", input: "\t", want: false},
		{name: "ESC", input: "\x1b", want: false},

		// ── invalid: bidirectional override/control characters ───────────────
		// These can be used to visually spoof text in the UI.
		{name: "U+202A LTR embedding", input: "\u202A", want: false},
		{name: "U+202B RTL embedding", input: "\u202B", want: false},
		{name: "U+202C pop directional formatting", input: "\u202C", want: false},
		{name: "U+202D LTR override", input: "\u202D", want: false},
		{name: "U+202E RTL override (RLO)", input: "\u202E", want: false},
		{name: "U+2066 LTR isolate", input: "\u2066", want: false},
		{name: "U+2067 RTL isolate", input: "\u2067", want: false},
		{name: "U+2068 first strong isolate", input: "\u2068", want: false},
		{name: "U+2069 pop directional isolate", input: "\u2069", want: false},

		// Bidi control smuggled inside an otherwise valid emoji
		{name: "emoji with embedded RLO", input: "👍\u202E", want: false},

		// ── invalid: Unicode tag characters (U+E0000–U+E007F) ───────────────
		// These can encode hidden payloads in emoji sequences.
		{name: "U+E0001 LANGUAGE TAG", input: "\U000E0001", want: false},
		{name: "U+E0041 tag Latin A", input: "\U000E0041", want: false},
		{name: "U+E007F CANCEL TAG", input: "\U000E007F", want: false},
		{name: "emoji with embedded tag char", input: "🏳\U000E0067\U000E0062", want: false}, // flag + tag chars

		// ── invalid: Unicode space separators ───────────────────────────────
		// These are non-ASCII but would render as invisible emoji.
		{name: "U+00A0 no-break space", input: "\u00A0", want: false},
		{name: "U+2028 line separator", input: "\u2028", want: false},
		{name: "U+2029 paragraph separator", input: "\u2029", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := validation.IsValidReactionEmoji(tt.input)
			assert.Equal(t, tt.want, got,
				"IsValidReactionEmoji(%q) = %v, want %v", tt.input, got, tt.want)
		})
	}
}

func TestIsValidReactionEmoji_CharacterBoundary(t *testing.T) {
	exact := strings.Repeat("👍", 10)
	assert.True(t, validation.IsValidReactionEmoji(exact), "10-emoji string should be accepted")

	tooMany := strings.Repeat("👍", 11)
	assert.False(t, validation.IsValidReactionEmoji(tooMany), "11-emoji string should be rejected")
}

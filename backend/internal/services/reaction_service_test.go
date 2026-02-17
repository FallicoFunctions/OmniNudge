package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// ---------------------------------------------------------------------------
// isValidEmoji — unit tests
// These live in the services package (not services_test) to access the
// unexported isValidEmoji function directly.
// ---------------------------------------------------------------------------

func TestIsValidEmoji(t *testing.T) {
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
		{name: "100 bytes exactly", input: string(make([]byte, 100)), want: false}, // all zero bytes = control chars, but tests byte cap

		// ── invalid: structural ─────────────────────────────────────────────
		{name: "empty string", input: "", want: false},
		{name: "too long (101 bytes)", input: "👍" + string(make([]byte, 97)), want: false}, // > 100 bytes
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

		// ── valid: adjacent to bidi range (must NOT be rejected) ────────────
		// U+2029 = paragraph separator (below range), U+206A is above range
		{name: "U+2029 paragraph separator (valid high char)", input: "\u2029", want: true},  // non-ASCII, not in bidi range
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isValidEmoji(tt.input)
			assert.Equal(t, tt.want, got,
				"isValidEmoji(%q) = %v, want %v", tt.input, got, tt.want)
		})
	}
}

// TestIsValidEmoji_ByteLengthBoundary verifies that the 100-byte cap uses byte
// count (len(s)) — not rune count — so a 26-rune emoji sequence that happens
// to be >100 bytes is correctly rejected.
func TestIsValidEmoji_ByteLengthBoundary(t *testing.T) {
	// Each of these emoji is 4 bytes in UTF-8. 26 × 4 = 104 bytes > 100.
	// Building it this way avoids hard-coding non-printable bytes.
	long := ""
	for i := 0; i < 26; i++ {
		long += "👍"
	}
	assert.Greater(t, len(long), 100, "test precondition: string must exceed 100 bytes")
	assert.False(t, isValidEmoji(long), "26-emoji string (104 bytes) should be rejected")

	// 25 × 4 = 100 bytes — right on the limit, should pass.
	exact := ""
	for i := 0; i < 25; i++ {
		exact += "👍"
	}
	assert.Equal(t, 100, len(exact), "test precondition: string must be exactly 100 bytes")
	assert.True(t, isValidEmoji(exact), "25-emoji string (100 bytes) should be accepted")
}

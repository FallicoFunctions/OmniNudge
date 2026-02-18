package validation

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsValidReactionEmoji(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{name: "thumbs up", input: "👍", want: true},
		{name: "ZWJ family sequence", input: "👨‍👩‍👧‍👦", want: true},
		{name: "skin tone modifier", input: "👍🏽", want: true},
		{name: "variation selector", input: "❤\uFE0F", want: true},

		{name: "empty string", input: "", want: false},
		{name: "ASCII only", input: "hello", want: false},
		{name: "newline", input: "\n", want: false},
		{name: "non-breaking space", input: "\u00A0", want: false},
		{name: "emoji with RLO", input: "👍\u202E", want: false},
		{name: "emoji with tag char", input: "🏳\U000E0067\U000E0062", want: false},
		{name: "11 code points", input: strings.Repeat("👍", 11), want: false},
		{name: "10 code points", input: strings.Repeat("👍", 10), want: true},
		{name: ">100 bytes", input: strings.Repeat("👍", 26), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, IsValidReactionEmoji(tt.input))
		})
	}
}

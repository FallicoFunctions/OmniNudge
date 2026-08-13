package server

import "testing"

// Shift+Enter is a documented chat affordance (runtime design 10.3), so the
// sanitiser must keep newlines while still dropping every other control rune.
func TestSanitizeChatBody_KeepsNewlinesDropsOtherControls(t *testing.T) {
	// Tabs are control runes too and stay stripped - only \n is exempted.
	got := sanitizeChatBody("hello\nworld\x07\x00 and\ttabs")
	want := "hello\nworld andtabs"
	if got != want {
		t.Fatalf("sanitizeChatBody = %q, want %q", got, want)
	}
}

func TestSanitizeChatBody_CapsNewlineFlood(t *testing.T) {
	body := "a"
	for i := 0; i < 40; i++ {
		body += "\n"
	}
	body += "b"

	got := sanitizeChatBody(body)
	newlines := 0
	for _, r := range got {
		if r == '\n' {
			newlines++
		}
	}
	if newlines > maxChatBodyNewlines {
		t.Fatalf("newlines = %d, want <= %d", newlines, maxChatBodyNewlines)
	}
}

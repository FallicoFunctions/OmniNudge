package handlers

import (
	"strings"
	"testing"
)

func TestIsValidFeedbackType(t *testing.T) {
	valid := []string{"report"}
	for _, value := range valid {
		if !isValidFeedbackType(value) {
			t.Fatalf("expected feedback type %q to be valid", value)
		}
	}

	invalid := []string{"", "bug", "other", "feedback", "survey", "nps", "NPS"}
	for _, value := range invalid {
		if isValidFeedbackType(value) {
			t.Fatalf("expected feedback type %q to be invalid", value)
		}
	}
}

func TestIsValidFeedbackCategory(t *testing.T) {
	valid := []string{"bug"}
	for _, value := range valid {
		if !isValidFeedbackCategory(value) {
			t.Fatalf("expected feedback category %q to be valid", value)
		}
	}

	invalid := []string{"", "feature_request", "other", "feature", "feedback", "BUG", "nps", "survey"}
	for _, value := range invalid {
		if isValidFeedbackCategory(value) {
			t.Fatalf("expected feedback category %q to be invalid", value)
		}
	}
}

func TestSanitizeFeedbackContext(t *testing.T) {
	longText := strings.Repeat("x", 2000)
	ctx := map[string]interface{}{
		"":          "ignore-empty-key",
		"long":      longText,
		"bool":      true,
		"number":    42,
		"slice":     []string{"a", "b"},
		"map_value": map[string]string{"k": "v"},
	}

	sanitized := sanitizeFeedbackContext(ctx)

	if _, exists := sanitized[""]; exists {
		t.Fatal("expected empty key to be removed")
	}
	longValue, ok := sanitized["long"].(string)
	if !ok {
		t.Fatal("expected long value to remain a string")
	}
	if len(longValue) != 1024 {
		t.Fatalf("expected long value to be truncated to 1024 chars, got %d", len(longValue))
	}
	if sanitized["bool"] != true {
		t.Fatal("expected bool value to remain unchanged")
	}
	if sanitized["number"] != 42 {
		t.Fatal("expected numeric value to remain unchanged")
	}
	if _, ok := sanitized["slice"].(string); !ok {
		t.Fatal("expected non-scalar values to be converted to string")
	}
	if _, ok := sanitized["map_value"].(string); !ok {
		t.Fatal("expected map values to be converted to string")
	}
}

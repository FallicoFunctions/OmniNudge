package models

import (
	"testing"
	"time"
)

// This is a lightweight test using struct validation.
// Actual DB tests are in user_ban_test.go

func TestBanStatusStruct(t *testing.T) {
	// Ensure struct fields are present and default zero-values don't panic
	status := &BanStatus{}
	if status.Banned || status.ShadowBanned || status.Deleted {
		t.Fatalf("expected zero ban flags to be false")
	}
}

// Compile-time check to ensure BanHistory stays aligned
func TestBanHistoryFields(t *testing.T) {
	now := time.Now()
	h := BanHistory{
		ID:         1,
		UserID:     2,
		Action:     "ban",
		Reason:     "test",
		ShowReason: true,
		AdminID:    3,
		AdminName:  "admin",
		CreatedAt:  now,
	}
	if h.Action == "" || h.Reason == "" || h.AdminName == "" {
		t.Fatalf("expected BanHistory fields to be set")
	}
}

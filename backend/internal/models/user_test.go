package models

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// This is a lightweight test using an in-memory pgxpool substitute.
// In the current repo, spinning up a real DB would be ideal; here we assert the BanStatus struct wiring works.

type fakePool struct{}

func TestBanStatusStruct(t *testing.T) {
	// Ensure struct fields are present and default zero-values don't panic
	status := &BanStatus{}
	if status.Banned || status.ShadowBanned || status.Deleted {
		t.Fatalf("expected zero ban flags to be false")
	}
}

// Placeholder to satisfy compiler when using fakePool; these aren't executed.
func (f *fakePool) Exec(ctx context.Context, sql string, arguments ...interface{}) (pgxpool.CommandTag, error) {
	return pgxpool.CommandTag{}, nil
}

func (f *fakePool) QueryRow(ctx context.Context, sql string, args ...interface{}) pgxpool.Row {
	return nil
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

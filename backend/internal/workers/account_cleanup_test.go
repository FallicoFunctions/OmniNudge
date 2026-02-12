package workers

import (
	"testing"
)

func TestNewAccountCleanupWorker(t *testing.T) {
	w := NewAccountCleanupWorker(nil, nil, nil)
	if w == nil {
		t.Fatal("NewAccountCleanupWorker returned nil")
	}
	if w.db != nil {
		t.Error("expected db to be nil when passed nil")
	}
	if w.scrubber != nil {
		t.Error("expected scrubber to be nil when passed nil")
	}
}

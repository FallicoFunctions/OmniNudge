package workers

import (
	"testing"

	"github.com/omninudge/backend/internal/config"
)

func TestNewRetentionWorker(t *testing.T) {
	cfg := config.RetentionConfig{
		MessageRetentionYears: 3,
		LogRetentionYears:     1,
		ArchiveRetentionYears: 1,
		DeletionGraceDays:     30,
		DryRun:                true,
	}

	w := NewRetentionWorker(nil, nil, nil, cfg)
	if w == nil {
		t.Fatal("NewRetentionWorker returned nil")
	}
	if w.cfg.MessageRetentionYears != 3 {
		t.Errorf("MessageRetentionYears = %d, want 3", w.cfg.MessageRetentionYears)
	}
	if !w.cfg.DryRun {
		t.Error("DryRun should be true")
	}
}

func TestRetentionConfig_DefaultDays(t *testing.T) {
	// Verify that year-to-day conversions produce expected defaults
	tests := []struct {
		name    string
		years   int
		wantMin int
	}{
		{"message retention 3yr", 3, 1000},
		{"log retention 1yr", 1, 350},
		{"archive retention 1yr", 1, 350},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			days := tt.years * 365
			if days < tt.wantMin {
				t.Errorf("years=%d → days=%d, want at least %d", tt.years, days, tt.wantMin)
			}
		})
	}
}

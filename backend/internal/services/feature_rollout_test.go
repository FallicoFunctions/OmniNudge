package services

import "testing"

func TestGetRolloutStages_DefaultLadder(t *testing.T) {
	stages := GetRolloutStages()
	if len(stages) != 6 {
		t.Fatalf("expected 6 rollout stages, got %d", len(stages))
	}

	expected := []float64{1, 5, 10, 25, 50, 100}
	for i, stage := range stages {
		if stage.Percentage != expected[i] {
			t.Fatalf("expected stage %d percentage %.0f, got %.0f", i, expected[i], stage.Percentage)
		}
	}
}

func TestGetDefaultRollbackTriggers_Defaults(t *testing.T) {
	triggers := GetDefaultRollbackTriggers()
	if triggers.ErrorRateThreshold != 1.0 {
		t.Fatalf("expected error rate threshold 1.0, got %f", triggers.ErrorRateThreshold)
	}
	if triggers.CrashRateThreshold != 0.1 {
		t.Fatalf("expected crash rate threshold 0.1, got %f", triggers.CrashRateThreshold)
	}
	if triggers.ComplaintThreshold != 10 {
		t.Fatalf("expected complaint threshold 10, got %d", triggers.ComplaintThreshold)
	}
}

func TestGetPhase0FeatureSuccessMetrics_F1ToF14(t *testing.T) {
	metrics := GetPhase0FeatureSuccessMetrics()
	if len(metrics) != 14 {
		t.Fatalf("expected 14 feature metric definitions, got %d", len(metrics))
	}

	for _, m := range metrics {
		if m.FeatureKey == "" {
			t.Fatal("feature key must not be empty")
		}
		if len(m.EngagementMetrics) == 0 {
			t.Fatalf("feature %s has no engagement metrics", m.FeatureKey)
		}
		if m.PerformanceBudgetMS <= 0 {
			t.Fatalf("feature %s has invalid performance budget", m.FeatureKey)
		}
	}
}

func TestHashUserID_IsDeterministic(t *testing.T) {
	a := hashUserID(12345, "new_messaging_ui")
	b := hashUserID(12345, "new_messaging_ui")
	if a != b {
		t.Fatalf("hash should be deterministic; got %d and %d", a, b)
	}

	c := hashUserID(12346, "new_messaging_ui")
	if a == c {
		t.Fatalf("different user should hash to different bucket often enough; got same hash %d", a)
	}
}

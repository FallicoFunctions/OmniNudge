package workers

import (
	"context"
	"log"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

type rolloutAnalytics interface {
	GetSystemErrorRate(ctx context.Context, window time.Duration) (float64, error)
	GetFeatureErrorRate(ctx context.Context, key string, window time.Duration) (float64, int, error)
}

type rolloutFeatureFlags interface {
	ListFlags(ctx context.Context) ([]*models.FeatureFlag, error)
	UpdateFlag(ctx context.Context, key string, updates map[string]interface{}, changedBy int64) error
}

// RolloutMonitor monitors feature flag rollouts and triggers automated rollbacks
type RolloutMonitor struct {
	analytics   rolloutAnalytics
	featureFlag rolloutFeatureFlags
}

// NewRolloutMonitor creates a new rollout monitor
func NewRolloutMonitor(analytics *services.AnalyticsService, featureFlag *services.FeatureFlagService) *RolloutMonitor {
	return &RolloutMonitor{
		analytics:   analytics,
		featureFlag: featureFlag,
	}
}

// Run starts the monitoring loop
func (m *RolloutMonitor) Run(ctx context.Context) {
	log.Println("Rollout monitor started (1-minute interval)")
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("Rollout monitor stopping...")
			return
		case <-ticker.C:
			m.monitorRollouts(ctx)
		}
	}
}

func (m *RolloutMonitor) monitorRollouts(ctx context.Context) {
	flags, err := m.featureFlag.ListFlags(ctx)
	if err != nil {
		log.Printf("RolloutMonitor: failed to list flags: %v", err)
		return
	}

	// 1. Get system baseline error rate (last 10m)
	baseline, err := m.analytics.GetSystemErrorRate(ctx, 10*time.Minute)
	if err != nil {
		log.Printf("RolloutMonitor: failed to get baseline: %v", err)
		return
	}

	for _, flag := range flags {
		// Only monitor enabled flags with auto-rollback policy
		if !flag.AutoRollback || !flag.Enabled || flag.Rollback == nil {
			continue
		}

		window := time.Duration(flag.Rollback.WindowSeconds) * time.Second
		if window == 0 {
			window = 5 * time.Minute // Default fallback
		}

		errorRate, sampleSize, err := m.analytics.GetFeatureErrorRate(ctx, flag.Key, window)
		if err != nil {
			log.Printf("RolloutMonitor: failed to query stats for flag %s: %v", flag.Key, err)
			continue
		}

		// Ensure statistical significance
		if sampleSize < flag.Rollback.MinSampleSize {
			continue
		}

		// Rollback Trigger: Feature Error Rate > (System Baseline + Threshold)
		if errorRate > (baseline + flag.Rollback.Threshold) {
			log.Printf("[ROLLBACK] Triggered for feature %s. Error Rate: %.2f%%, Baseline: %.2f%%, Threshold: %.2f%%, Sample Size: %d",
				flag.Key, errorRate*100, baseline*100, flag.Rollback.Threshold*100, sampleSize)

			// Disable the flag automatically (using system ID 0)
			updates := map[string]interface{}{
				"enabled":     false,
				"description": flag.Description + " (AUTOMATED ROLLBACK due to high error rate)",
			}

			if err := m.featureFlag.UpdateFlag(ctx, flag.Key, updates, 0); err != nil {
				log.Printf("[ROLLBACK] ERROR: Failed to disable flag %s: %v", flag.Key, err)
			} else {
				log.Printf("[ROLLBACK] SUCCESS: Flag %s has been disabled automatically", flag.Key)
				// TODO: Integrate Slack/Alerting notification here
			}
		}
	}
}

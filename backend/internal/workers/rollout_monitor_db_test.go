package workers

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/utils"
	"github.com/stretchr/testify/require"
)

func getRolloutTestDB(t *testing.T) *database.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping rollout DB integration test")
	}

	db, err := database.New(dsn)
	require.NoError(t, err)
	require.NoError(t, db.Migrate(context.Background()))
	t.Cleanup(db.Close)
	return db
}

func TestRolloutMonitor_DBBacked_DummyRolloutAutoRollback(t *testing.T) {
	ctx := context.Background()
	db := getRolloutTestDB(t)

	flagRepo := repository.NewFeatureFlagRepository(db.Pool)
	analytics := services.NewAnalyticsService(db.Pool)
	featureFlags := services.NewFeatureFlagService(flagRepo, nil, nil, "dev")

	runID := fmt.Sprintf("rollout_db_e2e_%d", time.Now().UnixNano())
	flagKey := "e2e_rollout_" + runID

	// Ensure cleanup for deterministic reruns.
	t.Cleanup(func() {
		_, _ = db.Pool.Exec(ctx, `DELETE FROM analytics_events WHERE properties->>'e2e_run' = $1`, runID)
		_, _ = db.Pool.Exec(ctx, `DELETE FROM feature_flag_audit WHERE flag_key = $1`, flagKey)
		_, _ = db.Pool.Exec(ctx, `DELETE FROM feature_flags WHERE key = $1`, flagKey)
	})

	// Create a real user for audit foreign-key safety.
	userRepo := models.NewUserRepository(db.Pool)
	hash, err := utils.HashPassword("rollout_test_password")
	require.NoError(t, err)
	user := &models.User{
		Username:     "rollout_actor_" + runID,
		PasswordHash: hash,
		Role:         "admin",
	}
	require.NoError(t, userRepo.Create(ctx, user))
	t.Cleanup(func() {
		_, _ = db.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, user.ID)
	})

	rollbackConfig := &models.RollbackTrigger{
		MetricType:         "error_rate",
		Threshold:          0.01,
		CrashRateThreshold: 0.001,
		ComplaintThreshold: 10,
		MinSampleSize:      100,
		WindowSeconds:      600,
	}
	rolloutPct := 50
	flag := &models.FeatureFlag{
		Key:          flagKey,
		Enabled:      true,
		Description:  "DB-backed dummy rollout verification",
		Percentage:   &rolloutPct,
		Environment:  "all",
		AutoRollback: true,
		Rollback:     rollbackConfig,
		Metadata:     map[string]interface{}{"e2e_run": runID},
	}
	require.NoError(t, featureFlags.CreateFlag(ctx, flag, int64(user.ID)))

	// Baseline traffic (healthy): lowers global baseline error rate.
	for i := 0; i < 400; i++ {
		require.NoError(t, analytics.TrackEvent(ctx, services.Event{
			Name:       "page_view",
			IPAddress:  "127.0.0.1",
			UserAgent:  "rollout-monitor-db-test",
			Properties: map[string]interface{}{"e2e_run": runID},
		}))
	}

	// Feature traffic with high error ratio.
	for i := 0; i < 120; i++ {
		require.NoError(t, analytics.TrackEvent(ctx, services.Event{
			Name:      "page_view",
			IPAddress: "127.0.0.1",
			UserAgent: "rollout-monitor-db-test",
			Properties: map[string]interface{}{
				"e2e_run":      runID,
				"active_flags": []string{flagKey},
			},
		}))
	}
	for i := 0; i < 80; i++ {
		require.NoError(t, analytics.TrackEvent(ctx, services.Event{
			Name:      services.EventErrorOccurred,
			IPAddress: "127.0.0.1",
			UserAgent: "rollout-monitor-db-test",
			Properties: map[string]interface{}{
				"e2e_run":      runID,
				"severity":     "error",
				"active_flags": []string{flagKey},
			},
		}))
	}

	monitor := NewRolloutMonitor(analytics, featureFlags)
	monitor.monitorRollouts(ctx)

	updated, err := featureFlags.GetFeatureFlag(ctx, flagKey)
	require.NoError(t, err)
	require.False(t, updated.Enabled, "rollout monitor should disable feature on threshold breach")
}

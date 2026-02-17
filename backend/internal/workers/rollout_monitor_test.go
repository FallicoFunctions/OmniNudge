package workers

import (
	"context"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/mock"
)

type mockRolloutAnalytics struct {
	mock.Mock
}

func (m *mockRolloutAnalytics) GetSystemErrorRate(ctx context.Context, window time.Duration) (float64, error) {
	args := m.Called(ctx, window)
	return args.Get(0).(float64), args.Error(1)
}

func (m *mockRolloutAnalytics) GetFeatureErrorRate(ctx context.Context, key string, window time.Duration) (float64, int, error) {
	args := m.Called(ctx, key, window)
	return args.Get(0).(float64), args.Int(1), args.Error(2)
}

func (m *mockRolloutAnalytics) GetFeatureCrashRate(ctx context.Context, key string, window time.Duration) (float64, int, error) {
	args := m.Called(ctx, key, window)
	return args.Get(0).(float64), args.Int(1), args.Error(2)
}

func (m *mockRolloutAnalytics) GetFeatureComplaintCount(ctx context.Context, key string, window time.Duration) (int, error) {
	args := m.Called(ctx, key, window)
	return args.Int(0), args.Error(1)
}

type mockRolloutFeatureFlags struct {
	mock.Mock
}

func (m *mockRolloutFeatureFlags) ListFlags(ctx context.Context) ([]*models.FeatureFlag, error) {
	args := m.Called(ctx)
	return args.Get(0).([]*models.FeatureFlag), args.Error(1)
}

func (m *mockRolloutFeatureFlags) UpdateFlag(ctx context.Context, key string, updates map[string]interface{}, changedBy int64) error {
	args := m.Called(ctx, key, updates, changedBy)
	return args.Error(0)
}

func TestRolloutMonitor_TriggersAutoRollbackOnThresholdBreach(t *testing.T) {
	ctx := context.Background()
	analytics := &mockRolloutAnalytics{}
	flags := &mockRolloutFeatureFlags{}

	rollback := &models.RollbackTrigger{
		Threshold:     0.01,
		MinSampleSize: 100,
		WindowSeconds: 60,
	}

	enabledFlag := &models.FeatureFlag{
		Key:          "new_messaging_ui",
		Enabled:      true,
		AutoRollback: true,
		Description:  "Test rollout",
		Rollback:     rollback,
	}

	flags.On("ListFlags", mock.Anything).Return([]*models.FeatureFlag{enabledFlag}, nil).Once()
	analytics.On("GetSystemErrorRate", mock.Anything, 10*time.Minute).Return(0.01, nil).Once()
	analytics.On("GetFeatureErrorRate", mock.Anything, "new_messaging_ui", 60*time.Second).Return(0.03, 200, nil).Once()
	analytics.On("GetFeatureCrashRate", mock.Anything, "new_messaging_ui", 60*time.Second).Return(0.0, 200, nil).Maybe()
	analytics.On("GetFeatureComplaintCount", mock.Anything, "new_messaging_ui", 60*time.Second).Return(0, nil).Maybe()
	flags.On(
		"UpdateFlag",
		mock.Anything,
		"new_messaging_ui",
		mock.MatchedBy(func(updates map[string]interface{}) bool {
			enabled, ok := updates["enabled"].(bool)
			if !ok || enabled {
				return false
			}
			description, ok := updates["description"].(string)
			return ok && description != ""
		}),
		int64(0),
	).Return(nil).Once()

	monitor := &RolloutMonitor{
		analytics:   analytics,
		featureFlag: flags,
	}
	monitor.monitorRollouts(ctx)

	flags.AssertExpectations(t)
	analytics.AssertExpectations(t)
}

func TestRolloutMonitor_DoesNotRollbackWhenSampleSizeTooSmall(t *testing.T) {
	ctx := context.Background()
	analytics := &mockRolloutAnalytics{}
	flags := &mockRolloutFeatureFlags{}

	rollback := &models.RollbackTrigger{
		Threshold:     0.01,
		MinSampleSize: 500,
		WindowSeconds: 60,
	}

	enabledFlag := &models.FeatureFlag{
		Key:          "new_search_algorithm",
		Enabled:      true,
		AutoRollback: true,
		Description:  "Search rollout",
		Rollback:     rollback,
	}

	flags.On("ListFlags", mock.Anything).Return([]*models.FeatureFlag{enabledFlag}, nil).Once()
	analytics.On("GetSystemErrorRate", mock.Anything, 10*time.Minute).Return(0.01, nil).Once()
	analytics.On("GetFeatureErrorRate", mock.Anything, "new_search_algorithm", 60*time.Second).Return(0.03, 100, nil).Once()
	analytics.On("GetFeatureCrashRate", mock.Anything, "new_search_algorithm", 60*time.Second).Return(0.0, 100, nil).Once()
	analytics.On("GetFeatureComplaintCount", mock.Anything, "new_search_algorithm", 60*time.Second).Return(0, nil).Once()

	monitor := &RolloutMonitor{
		analytics:   analytics,
		featureFlag: flags,
	}
	monitor.monitorRollouts(ctx)

	// Should not call UpdateFlag because sample size does not meet threshold.
	flags.AssertNotCalled(t, "UpdateFlag", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	analytics.AssertExpectations(t)
	flags.AssertExpectations(t)
}

func TestRolloutMonitor_SkipsFlagsWithoutAutoRollback(t *testing.T) {
	ctx := context.Background()
	analytics := &mockRolloutAnalytics{}
	flags := &mockRolloutFeatureFlags{}

	noRollbackFlag := &models.FeatureFlag{
		Key:          "enhanced_notifications",
		Enabled:      true,
		AutoRollback: false,
	}

	flags.On("ListFlags", mock.Anything).Return([]*models.FeatureFlag{noRollbackFlag}, nil).Once()
	analytics.On("GetSystemErrorRate", mock.Anything, 10*time.Minute).Return(0.01, nil).Once()

	monitor := &RolloutMonitor{
		analytics:   analytics,
		featureFlag: flags,
	}
	monitor.monitorRollouts(ctx)

	flags.AssertNotCalled(t, "UpdateFlag", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	flags.AssertExpectations(t)
	analytics.AssertExpectations(t)
}

func TestRolloutMonitor_TriggersRollbackOnCrashRate(t *testing.T) {
	ctx := context.Background()
	analytics := &mockRolloutAnalytics{}
	flags := &mockRolloutFeatureFlags{}

	rollback := &models.RollbackTrigger{
		Threshold:          0.50,  // keep error-rate trigger effectively disabled for this test
		CrashRateThreshold: 0.001, // 0.1%
		MinSampleSize:      100,
		WindowSeconds:      60,
	}

	flag := &models.FeatureFlag{
		Key:          "voice_calls",
		Enabled:      true,
		AutoRollback: true,
		Description:  "Voice rollout",
		Rollback:     rollback,
	}

	flags.On("ListFlags", mock.Anything).Return([]*models.FeatureFlag{flag}, nil).Once()
	analytics.On("GetSystemErrorRate", mock.Anything, 10*time.Minute).Return(0.00, nil).Once()
	analytics.On("GetFeatureErrorRate", mock.Anything, "voice_calls", 60*time.Second).Return(0.00, 200, nil).Once()
	analytics.On("GetFeatureCrashRate", mock.Anything, "voice_calls", 60*time.Second).Return(0.02, 200, nil).Once()
	flags.On("UpdateFlag", mock.Anything, "voice_calls", mock.Anything, int64(0)).Return(nil).Once()

	monitor := &RolloutMonitor{
		analytics:   analytics,
		featureFlag: flags,
	}
	monitor.monitorRollouts(ctx)

	flags.AssertExpectations(t)
	analytics.AssertExpectations(t)
}

func TestRolloutMonitor_TriggersRollbackOnComplaintCount(t *testing.T) {
	ctx := context.Background()
	analytics := &mockRolloutAnalytics{}
	flags := &mockRolloutFeatureFlags{}

	rollback := &models.RollbackTrigger{
		Threshold:          0.50,
		CrashRateThreshold: 0.50,
		ComplaintThreshold: 10,
		MinSampleSize:      100,
		WindowSeconds:      60,
	}

	flag := &models.FeatureFlag{
		Key:          "new_search_algorithm",
		Enabled:      true,
		AutoRollback: true,
		Description:  "Search rollout",
		Rollback:     rollback,
	}

	flags.On("ListFlags", mock.Anything).Return([]*models.FeatureFlag{flag}, nil).Once()
	analytics.On("GetSystemErrorRate", mock.Anything, 10*time.Minute).Return(0.00, nil).Once()
	analytics.On("GetFeatureErrorRate", mock.Anything, "new_search_algorithm", 60*time.Second).Return(0.00, 200, nil).Once()
	analytics.On("GetFeatureCrashRate", mock.Anything, "new_search_algorithm", 60*time.Second).Return(0.00, 200, nil).Once()
	analytics.On("GetFeatureComplaintCount", mock.Anything, "new_search_algorithm", 60*time.Second).Return(11, nil).Once()
	flags.On("UpdateFlag", mock.Anything, "new_search_algorithm", mock.Anything, int64(0)).Return(nil).Once()

	monitor := &RolloutMonitor{
		analytics:   analytics,
		featureFlag: flags,
	}
	monitor.monitorRollouts(ctx)

	flags.AssertExpectations(t)
	analytics.AssertExpectations(t)
}

package services

import (
	"context"
	"crypto/md5"
	"encoding/binary"
)

// RolloutService handles gradual feature rollout logic
type RolloutService struct {
	featureFlags *FeatureFlagService
}

func NewRolloutService(featureFlags *FeatureFlagService) *RolloutService {
	return &RolloutService{
		featureFlags: featureFlags,
	}
}

// IsFeatureEnabledForUser determines if a feature is enabled for a specific user
// Uses consistent hashing to ensure same user always gets same result
func (s *RolloutService) IsFeatureEnabledForUser(ctx context.Context, featureKey string, userID int) (bool, error) {
	// Check if user has an override first
	enabled, err := s.featureFlags.IsEnabled(ctx, featureKey, userID)
	if err != nil {
		return false, err
	}

	// If feature is globally disabled, respect that
	flag, err := s.featureFlags.GetFlag(ctx, featureKey)
	if err != nil {
		return false, nil // Default to disabled if flag doesn't exist
	}

	if !flag.Enabled {
		return false, nil
	}

	// Check if there's a rollout percentage in metadata
	if rolloutPct, ok := flag.Metadata["rollout_percentage"].(float64); ok {
		// Use consistent hashing to determine if user is in rollout group
		userHash := hashUserID(userID, featureKey)
		userPercentile := userHash % 100

		if float64(userPercentile) < rolloutPct {
			return true, nil
		}
		return false, nil
	}

	// No rollout percentage set, return global flag state
	return enabled, nil
}

// hashUserID creates a consistent hash for a user+feature combination
// Same user will always get same hash for same feature
func hashUserID(userID int, featureKey string) uint32 {
	data := []byte(featureKey)
	userBytes := make([]byte, 4)
	binary.LittleEndian.PutUint32(userBytes, uint32(userID))
	data = append(data, userBytes...)

	hash := md5.Sum(data)
	return binary.LittleEndian.Uint32(hash[:4])
}

// RolloutStage represents a stage in gradual rollout
type RolloutStage struct {
	Percentage  float64 `json:"percentage"`
	Description string  `json:"description"`
	Duration    string  `json:"duration"` // How long to stay at this stage
}

// GetRolloutStages returns standard rollout stages
func GetRolloutStages() []RolloutStage {
	return []RolloutStage{
		{Percentage: 1, Description: "Internal testing", Duration: "1-2 days"},
		{Percentage: 5, Description: "Early adopters", Duration: "2-3 days"},
		{Percentage: 10, Description: "Small user group", Duration: "3-5 days"},
		{Percentage: 25, Description: "Quarter of users", Duration: "1 week"},
		{Percentage: 50, Description: "Half of users", Duration: "1 week"},
		{Percentage: 100, Description: "All users", Duration: "Ongoing"},
	}
}

// RollbackTriggers defines when to automatically rollback
type RollbackTriggers struct {
	ErrorRateThreshold  float64 `json:"error_rate_threshold"`   // e.g., 1.0 = 1%
	CrashRateThreshold  float64 `json:"crash_rate_threshold"`   // e.g., 0.1 = 0.1%
	ComplaintThreshold  int     `json:"complaint_threshold"`    // Number of complaints
	LatencyIncreaseMax  float64 `json:"latency_increase_max"`   // Max % increase in latency
	EngagementDropMax   float64 `json:"engagement_drop_max"`    // Max % drop in engagement
}

// GetDefaultRollbackTriggers returns recommended rollback triggers
func GetDefaultRollbackTriggers() RollbackTriggers {
	return RollbackTriggers{
		ErrorRateThreshold: 1.0,   // 1% error rate
		CrashRateThreshold: 0.1,   // 0.1% crash rate
		ComplaintThreshold: 10,    // 10 user complaints
		LatencyIncreaseMax: 20.0,  // 20% latency increase
		EngagementDropMax:  10.0,  // 10% engagement drop
	}
}

// FeatureMetrics defines success metrics for a feature
type FeatureMetrics struct {
	FeatureKey          string   `json:"feature_key"`
	EngagementMetrics   []string `json:"engagement_metrics"`   // e.g., ["messages_sent", "calls_made"]
	RetentionTarget     float64  `json:"retention_target"`     // Target retention rate
	NPSTarget           float64  `json:"nps_target"`           // Target NPS score
	PerformanceBudgetMS int      `json:"performance_budget_ms"` // Max latency in ms
}

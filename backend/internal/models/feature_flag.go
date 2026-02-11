package models

import "time"

// FeatureFlag represents a feature flag configuration
type FeatureFlag struct {
	Key          string                 `json:"key" db:"key"`
	Enabled      bool                   `json:"enabled" db:"enabled"`
	Description  string                 `json:"description" db:"description"`
	Percentage   *int                   `json:"percentage,omitempty" db:"percentage"` // 0-100, nil = not using percentage rollout
	Environment  string                 `json:"environment" db:"environment"`         // 'all', 'dev', 'staging', 'prod'
	AutoRollback bool                   `json:"auto_rollback" db:"auto_rollback"`
	Rollback     *RollbackTrigger       `json:"rollback,omitempty" db:"rollback"`
	Metadata     map[string]interface{} `json:"metadata" db:"metadata"`
	CreatedAt    time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at" db:"updated_at"`
}

// RollbackTrigger defines conditions for automated feature rollback
type RollbackTrigger struct {
	MetricType    string  `json:"metric_type"`     // 'error_rate', 'latency'
	Threshold     float64 `json:"threshold"`       // e.g., 0.01 for 1%
	MinSampleSize int     `json:"min_sample_size"` // e.g., 100
	WindowSeconds int     `json:"window_seconds"`  // e.g., 60
}

// FeatureFlagOverride represents a per-user override
type FeatureFlagOverride struct {
	FlagKey   string    `json:"flag_key" db:"flag_key"`
	UserID    int64     `json:"user_id" db:"user_id"`
	Enabled   bool      `json:"enabled" db:"enabled"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// FeatureFlagAudit represents an audit log entry for flag changes
type FeatureFlagAudit struct {
	ID         int64                  `json:"id" db:"id"`
	FlagKey    string                 `json:"flag_key" db:"flag_key"`
	ChangeType string                 `json:"change_type" db:"change_type"` // 'created', 'enabled', 'disabled', 'percentage_changed', 'override_set', 'override_removed'
	ChangedBy  int64                  `json:"changed_by" db:"changed_by"`
	OldValue   map[string]interface{} `json:"old_value,omitempty" db:"old_value"`
	NewValue   map[string]interface{} `json:"new_value,omitempty" db:"new_value"`
	ChangedAt  time.Time              `json:"changed_at" db:"changed_at"`
}

// FeatureFlagStatus is used for client API responses (only enabled flags)
type FeatureFlagStatus struct {
	Key     string `json:"key"`
	Enabled bool   `json:"enabled"`
}

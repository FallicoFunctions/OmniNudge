package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

type FeatureFlagRepository struct {
	pool *pgxpool.Pool
}

// Compile-time interface check.
var _ ports.FeatureFlagRepository = (*FeatureFlagRepository)(nil)

func NewFeatureFlagRepository(pool *pgxpool.Pool) *FeatureFlagRepository {
	return &FeatureFlagRepository{pool: pool}
}

// GetFlag retrieves a single flag by key
func (r *FeatureFlagRepository) GetFlag(ctx context.Context, key string) (*models.FeatureFlag, error) {
	query := `
		SELECT key, enabled, description, percentage, environment, auto_rollback, rollback, metadata, created_at, updated_at
		FROM feature_flags
		WHERE key = $1
	`

	var flag models.FeatureFlag
	var metadataJSON, rollbackJSON []byte

	err := r.pool.QueryRow(ctx, query, key).Scan(
		&flag.Key, &flag.Enabled, &flag.Description, &flag.Percentage,
		&flag.Environment, &flag.AutoRollback, &rollbackJSON, &metadataJSON, &flag.CreatedAt, &flag.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if len(metadataJSON) > 0 {
		_ = json.Unmarshal(metadataJSON, &flag.Metadata)
	}
	if len(rollbackJSON) > 0 {
		_ = json.Unmarshal(rollbackJSON, &flag.Rollback)
	}

	return &flag, nil
}

// ListFlags retrieves all flags for a specific environment
func (r *FeatureFlagRepository) ListFlags(ctx context.Context, environment string) ([]*models.FeatureFlag, error) {
	query := `
		SELECT key, enabled, description, percentage, environment, auto_rollback, rollback, metadata, created_at, updated_at
		FROM feature_flags
		WHERE environment = $1 OR environment = 'all'
		ORDER BY key
	`

	rows, err := r.pool.Query(ctx, query, environment)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var flags []*models.FeatureFlag
	for rows.Next() {
		var flag models.FeatureFlag
		var metadataJSON, rollbackJSON []byte

		err := rows.Scan(
			&flag.Key, &flag.Enabled, &flag.Description, &flag.Percentage,
			&flag.Environment, &flag.AutoRollback, &rollbackJSON, &metadataJSON, &flag.CreatedAt, &flag.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		if len(metadataJSON) > 0 {
			json.Unmarshal(metadataJSON, &flag.Metadata)
		}
		if len(rollbackJSON) > 0 {
			json.Unmarshal(rollbackJSON, &flag.Rollback)
		}

		flags = append(flags, &flag)
	}

	return flags, nil
}

// CreateFlag creates a new feature flag
func (r *FeatureFlagRepository) CreateFlag(ctx context.Context, flag *models.FeatureFlag) error {
	metadataJSON, _ := json.Marshal(flag.Metadata)
	rollbackJSON, _ := json.Marshal(flag.Rollback)

	query := `
		INSERT INTO feature_flags (key, enabled, description, percentage, environment, auto_rollback, rollback, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`

	_, err := r.pool.Exec(ctx, query,
		flag.Key, flag.Enabled, flag.Description, flag.Percentage,
		flag.Environment, flag.AutoRollback, rollbackJSON, metadataJSON,
	)
	return err
}

// UpdateFlag updates an existing feature flag
func (r *FeatureFlagRepository) UpdateFlag(ctx context.Context, flag *models.FeatureFlag) error {
	metadataJSON, _ := json.Marshal(flag.Metadata)
	rollbackJSON, _ := json.Marshal(flag.Rollback)

	query := `
		UPDATE feature_flags
		SET enabled = $2, description = $3, percentage = $4, environment = $5, 
		    auto_rollback = $6, rollback = $7, metadata = $8, updated_at = NOW()
		WHERE key = $1
	`

	result, err := r.pool.Exec(ctx, query,
		flag.Key, flag.Enabled, flag.Description, flag.Percentage,
		flag.Environment, flag.AutoRollback, rollbackJSON, metadataJSON,
	)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return errors.New("flag not found")
	}

	return nil
}

// DeleteFlag deletes a feature flag
func (r *FeatureFlagRepository) DeleteFlag(ctx context.Context, key string) error {
	query := `DELETE FROM feature_flags WHERE key = $1`

	result, err := r.pool.Exec(ctx, query, key)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return errors.New("flag not found")
	}

	return nil
}

// GetUserOverride retrieves a user's override for a flag (returns nil if no override)
func (r *FeatureFlagRepository) GetUserOverride(ctx context.Context, key string, userID int64) (*bool, error) {
	query := `
		SELECT enabled
		FROM feature_flag_overrides
		WHERE flag_key = $1 AND user_id = $2
	`

	var enabled bool
	err := r.pool.QueryRow(ctx, query, key, userID).Scan(&enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // No override exists
		}
		return nil, err
	}

	return &enabled, nil
}

// SetUserOverride sets or updates a user's override for a flag
func (r *FeatureFlagRepository) SetUserOverride(ctx context.Context, key string, userID int64, enabled bool) error {
	query := `
		INSERT INTO feature_flag_overrides (flag_key, user_id, enabled)
		VALUES ($1, $2, $3)
		ON CONFLICT (flag_key, user_id) DO UPDATE SET enabled = $3
	`

	_, err := r.pool.Exec(ctx, query, key, userID, enabled)
	return err
}

// RemoveUserOverride removes a user's override for a flag
func (r *FeatureFlagRepository) RemoveUserOverride(ctx context.Context, key string, userID int64) error {
	query := `DELETE FROM feature_flag_overrides WHERE flag_key = $1 AND user_id = $2`

	result, err := r.pool.Exec(ctx, query, key, userID)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return errors.New("override not found")
	}

	return nil
}

// CreateAuditLog creates an audit log entry
func (r *FeatureFlagRepository) CreateAuditLog(ctx context.Context, audit *models.FeatureFlagAudit) error {
	oldValueJSON, _ := json.Marshal(audit.OldValue)
	newValueJSON, _ := json.Marshal(audit.NewValue)

	query := `
		INSERT INTO feature_flag_audit (flag_key, change_type, changed_by, old_value, new_value)
		VALUES ($1, $2, $3, $4, $5)
	`

	_, err := r.pool.Exec(ctx, query,
		audit.FlagKey, audit.ChangeType, audit.ChangedBy, oldValueJSON, newValueJSON,
	)
	return err
}

// GetAuditLog retrieves audit log entries for a flag
func (r *FeatureFlagRepository) GetAuditLog(ctx context.Context, key string, limit int) ([]*models.FeatureFlagAudit, error) {
	query := `
		SELECT id, flag_key, change_type, changed_by, old_value, new_value, changed_at
		FROM feature_flag_audit
		WHERE flag_key = $1
		ORDER BY changed_at DESC
		LIMIT $2
	`

	rows, err := r.pool.Query(ctx, query, key, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []*models.FeatureFlagAudit
	for rows.Next() {
		var log models.FeatureFlagAudit
		var oldValueJSON, newValueJSON []byte

		err := rows.Scan(
			&log.ID, &log.FlagKey, &log.ChangeType, &log.ChangedBy,
			&oldValueJSON, &newValueJSON, &log.ChangedAt,
		)
		if err != nil {
			return nil, err
		}

		if len(oldValueJSON) > 0 {
			json.Unmarshal(oldValueJSON, &log.OldValue)
		}
		if len(newValueJSON) > 0 {
			json.Unmarshal(newValueJSON, &log.NewValue)
		}

		logs = append(logs, &log)
	}

	return logs, nil
}

// GetAnyUserID returns a valid user ID for system/audit fallback paths.
func (r *FeatureFlagRepository) GetAnyUserID(ctx context.Context) (int64, error) {
	var userID int64
	err := r.pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id ASC LIMIT 1`).Scan(&userID)
	if err != nil {
		return 0, err
	}
	return userID, nil
}

// AnalyticsEventsTableExists reports whether the analytics_events table exists in the DB.
// Call this once per CheckAutoRollbacks run rather than per flag.
func (r *FeatureFlagRepository) AnalyticsEventsTableExists(ctx context.Context) (bool, error) {
	var exists bool
	if err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'analytics_events')`,
	).Scan(&exists); err != nil {
		return false, fmt.Errorf("AnalyticsEventsTableExists: %w", err)
	}
	return exists, nil
}

// GetFlagErrorRate returns the error-event rate for a given flag key over the last windowSeconds.
// It counts events where event_name = 'error' AND properties->>'flag' = key, divided by all events
// for that flag in the same window. Returns (rate, totalEvents, error).

func (r *FeatureFlagRepository) GetFlagErrorRate(ctx context.Context, flagKey string, windowSeconds int) (rate float64, total int64, err error) {
	since := time.Now().Add(-time.Duration(windowSeconds) * time.Second)
	query := `
		SELECT
			COUNT(*) FILTER (WHERE event_name = 'error') AS errors,
			COUNT(*) AS total
		FROM analytics_events
		WHERE created_at >= $1
		  AND properties->>'flag' = $2
	`
	var errs int64
	if err = r.pool.QueryRow(ctx, query, since, flagKey).Scan(&errs, &total); err != nil {
		return 0, 0, fmt.Errorf("GetFlagErrorRate: %w", err)
	}
	if total == 0 {
		return 0, 0, nil
	}
	return float64(errs) / float64(total), total, nil
}

// GetFlagsWithAutoRollback returns all enabled flags that have auto_rollback = true.
func (r *FeatureFlagRepository) GetFlagsWithAutoRollback(ctx context.Context) ([]*models.FeatureFlag, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT key, enabled, description, percentage, environment, auto_rollback, rollback, metadata, created_at, updated_at
		FROM feature_flags
		WHERE enabled = TRUE AND auto_rollback = TRUE AND rollback IS NOT NULL
	`)
	if err != nil {
		return nil, fmt.Errorf("GetFlagsWithAutoRollback: %w", err)
	}
	defer rows.Close()

	var flags []*models.FeatureFlag
	for rows.Next() {
		var flag models.FeatureFlag
		var metadataJSON, rollbackJSON []byte
		if err := rows.Scan(
			&flag.Key, &flag.Enabled, &flag.Description, &flag.Percentage,
			&flag.Environment, &flag.AutoRollback, &rollbackJSON, &metadataJSON,
			&flag.CreatedAt, &flag.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("GetFlagsWithAutoRollback scan: %w", err)
		}
		if len(metadataJSON) > 0 {
			if err := json.Unmarshal(metadataJSON, &flag.Metadata); err != nil {
				return nil, fmt.Errorf("GetFlagsWithAutoRollback unmarshal metadata for %q: %w", flag.Key, err)
			}
		}
		if len(rollbackJSON) > 0 {
			if err := json.Unmarshal(rollbackJSON, &flag.Rollback); err != nil {
				return nil, fmt.Errorf("GetFlagsWithAutoRollback unmarshal rollback for %q: %w", flag.Key, err)
			}
		}
		flags = append(flags, &flag)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("GetFlagsWithAutoRollback rows: %w", err)
	}
	return flags, nil
}

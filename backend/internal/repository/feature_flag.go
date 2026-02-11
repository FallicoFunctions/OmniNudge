package repository

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
)

type FeatureFlagRepository struct {
	pool *pgxpool.Pool
}

func NewFeatureFlagRepository(pool *pgxpool.Pool) *FeatureFlagRepository {
	return &FeatureFlagRepository{pool: pool}
}

// GetFlag retrieves a single flag by key
func (r *FeatureFlagRepository) GetFlag(ctx context.Context, key string) (*models.FeatureFlag, error) {
	query := `
		SELECT key, enabled, description, percentage, environment, metadata, created_at, updated_at
		FROM feature_flags
		WHERE key = $1
	`

	var flag models.FeatureFlag
	var metadataJSON []byte

	err := r.pool.QueryRow(ctx, query, key).Scan(
		&flag.Key, &flag.Enabled, &flag.Description, &flag.Percentage,
		&flag.Environment, &metadataJSON, &flag.CreatedAt, &flag.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("flag not found")
		}
		return nil, err
	}

	if len(metadataJSON) > 0 {
		json.Unmarshal(metadataJSON, &flag.Metadata)
	}

	return &flag, nil
}

// ListFlags retrieves all flags for a specific environment
func (r *FeatureFlagRepository) ListFlags(ctx context.Context, environment string) ([]*models.FeatureFlag, error) {
	query := `
		SELECT key, enabled, description, percentage, environment, metadata, created_at, updated_at
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
		var metadataJSON []byte

		err := rows.Scan(
			&flag.Key, &flag.Enabled, &flag.Description, &flag.Percentage,
			&flag.Environment, &metadataJSON, &flag.CreatedAt, &flag.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		if len(metadataJSON) > 0 {
			json.Unmarshal(metadataJSON, &flag.Metadata)
		}

		flags = append(flags, &flag)
	}

	return flags, nil
}

// CreateFlag creates a new feature flag
func (r *FeatureFlagRepository) CreateFlag(ctx context.Context, flag *models.FeatureFlag) error {
	metadataJSON, _ := json.Marshal(flag.Metadata)

	query := `
		INSERT INTO feature_flags (key, enabled, description, percentage, environment, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	_, err := r.pool.Exec(ctx, query,
		flag.Key, flag.Enabled, flag.Description, flag.Percentage,
		flag.Environment, metadataJSON,
	)
	return err
}

// UpdateFlag updates an existing feature flag
func (r *FeatureFlagRepository) UpdateFlag(ctx context.Context, flag *models.FeatureFlag) error {
	metadataJSON, _ := json.Marshal(flag.Metadata)

	query := `
		UPDATE feature_flags
		SET enabled = $2, description = $3, percentage = $4, environment = $5, metadata = $6, updated_at = NOW()
		WHERE key = $1
	`

	result, err := r.pool.Exec(ctx, query,
		flag.Key, flag.Enabled, flag.Description, flag.Percentage,
		flag.Environment, metadataJSON,
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

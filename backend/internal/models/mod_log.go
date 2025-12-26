package models

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// JSONB is a custom type for PostgreSQL JSONB fields
type JSONB map[string]interface{}

func (j JSONB) Value() (driver.Value, error) {
	return json.Marshal(j)
}

func (j *JSONB) Scan(value interface{}) error {
	if value == nil {
		*j = make(map[string]interface{})
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to unmarshal JSONB value: %v", value)
	}

	return json.Unmarshal(bytes, j)
}

type ModLog struct {
	ID           int       `json:"id"`
	HubID        int       `json:"hub_id"`
	ModeratorID  int       `json:"moderator_id"`
	Action       string    `json:"action"`
	TargetType   string    `json:"target_type,omitempty"`
	TargetID     int       `json:"target_id,omitempty"`
	Details      JSONB     `json:"details,omitempty"`
	CreatedAt    time.Time `json:"created_at"`

	// Populated fields
	ModeratorName string `json:"moderator_name,omitempty"`
	HubName       string `json:"hub_name,omitempty"`
}

type ModLogRepository struct {
	db *pgxpool.Pool
}

func NewModLogRepository(db *pgxpool.Pool) *ModLogRepository {
	return &ModLogRepository{db: db}
}

// Log creates a new mod log entry
func (r *ModLogRepository) Log(ctx context.Context, hubID, moderatorID int, action, targetType string, targetID int, details JSONB) (*ModLog, error) {
	query := `
		INSERT INTO mod_logs (hub_id, moderator_id, action, target_type, target_id, details)
		VALUES ($1, $2, $3, $4, NULLIF($5, 0), $6)
		RETURNING id, hub_id, moderator_id, action, target_type, target_id, details, created_at
	`

	var log ModLog
	err := r.db.QueryRow(ctx, query, hubID, moderatorID, action, targetType, targetID, details).Scan(
		&log.ID, &log.HubID, &log.ModeratorID, &log.Action, &log.TargetType, &log.TargetID,
		&log.Details, &log.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create mod log: %w", err)
	}

	return &log, nil
}

// GetByHub retrieves mod logs for a specific hub with pagination
func (r *ModLogRepository) GetByHub(ctx context.Context, hubID int, limit, offset int) ([]*ModLog, error) {
	query := `
		SELECT ml.id, ml.hub_id, ml.moderator_id, ml.action, ml.target_type, ml.target_id,
			   ml.details, ml.created_at, u.username as moderator_name, h.name as hub_name
		FROM mod_logs ml
		JOIN users u ON ml.moderator_id = u.id
		JOIN hubs h ON ml.hub_id = h.id
		WHERE ml.hub_id = $1
		ORDER BY ml.created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.Query(ctx, query, hubID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get mod logs: %w", err)
	}
	defer rows.Close()

	var logs []*ModLog
	for rows.Next() {
		var log ModLog
		err := rows.Scan(
			&log.ID, &log.HubID, &log.ModeratorID, &log.Action, &log.TargetType, &log.TargetID,
			&log.Details, &log.CreatedAt, &log.ModeratorName, &log.HubName,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan mod log: %w", err)
		}
		logs = append(logs, &log)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating mod logs: %w", err)
	}

	return logs, nil
}

// GetByModerator retrieves mod logs for a specific moderator
func (r *ModLogRepository) GetByModerator(ctx context.Context, moderatorID int, limit, offset int) ([]*ModLog, error) {
	query := `
		SELECT ml.id, ml.hub_id, ml.moderator_id, ml.action, ml.target_type, ml.target_id,
			   ml.details, ml.created_at, u.username as moderator_name, h.name as hub_name
		FROM mod_logs ml
		JOIN users u ON ml.moderator_id = u.id
		JOIN hubs h ON ml.hub_id = h.id
		WHERE ml.moderator_id = $1
		ORDER BY ml.created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.Query(ctx, query, moderatorID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get mod logs: %w", err)
	}
	defer rows.Close()

	var logs []*ModLog
	for rows.Next() {
		var log ModLog
		err := rows.Scan(
			&log.ID, &log.HubID, &log.ModeratorID, &log.Action, &log.TargetType, &log.TargetID,
			&log.Details, &log.CreatedAt, &log.ModeratorName, &log.HubName,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan mod log: %w", err)
		}
		logs = append(logs, &log)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating mod logs: %w", err)
	}

	return logs, nil
}

// GetByAction retrieves mod logs filtered by action type
func (r *ModLogRepository) GetByAction(ctx context.Context, hubID int, action string, limit, offset int) ([]*ModLog, error) {
	query := `
		SELECT ml.id, ml.hub_id, ml.moderator_id, ml.action, ml.target_type, ml.target_id,
			   ml.details, ml.created_at, u.username as moderator_name, h.name as hub_name
		FROM mod_logs ml
		JOIN users u ON ml.moderator_id = u.id
		JOIN hubs h ON ml.hub_id = h.id
		WHERE ml.hub_id = $1 AND ml.action = $2
		ORDER BY ml.created_at DESC
		LIMIT $3 OFFSET $4
	`

	rows, err := r.db.Query(ctx, query, hubID, action, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get mod logs: %w", err)
	}
	defer rows.Close()

	var logs []*ModLog
	for rows.Next() {
		var log ModLog
		err := rows.Scan(
			&log.ID, &log.HubID, &log.ModeratorID, &log.Action, &log.TargetType, &log.TargetID,
			&log.Details, &log.CreatedAt, &log.ModeratorName, &log.HubName,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan mod log: %w", err)
		}
		logs = append(logs, &log)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating mod logs: %w", err)
	}

	return logs, nil
}

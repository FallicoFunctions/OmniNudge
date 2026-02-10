package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// FeatureFlag represents a feature toggle
type FeatureFlag struct {
	Key         string                 `json:"key"`
	Enabled     bool                   `json:"enabled"`
	Description string                 `json:"description"`
	Overrides   map[int]bool           `json:"overrides"` // user_id -> enabled
	Metadata    map[string]interface{} `json:"metadata"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
}

// FeatureFlagService manages feature flags with caching
type FeatureFlagService struct {
	db    *pgxpool.Pool
	cache map[string]*FeatureFlag
	mu    sync.RWMutex
	ttl   time.Duration
}

// NewFeatureFlagService creates a new feature flag service
func NewFeatureFlagService(db *pgxpool.Pool) *FeatureFlagService {
	svc := &FeatureFlagService{
		db:    db,
		cache: make(map[string]*FeatureFlag),
		ttl:   5 * time.Minute, // Cache flags for 5 minutes
	}

	// Start background cache refresh
	go svc.refreshCache()

	return svc
}

// IsEnabled checks if a feature is enabled for a user
func (s *FeatureFlagService) IsEnabled(ctx context.Context, key string, userID int) (bool, error) {
	flag, err := s.GetFlag(ctx, key)
	if err != nil {
		// If flag doesn't exist, default to disabled
		if err.Error() == "flag not found" {
			return false, nil
		}
		return false, err
	}

	// Check user override first
	if override, exists := flag.Overrides[userID]; exists {
		return override, nil
	}

	// Return global setting
	return flag.Enabled, nil
}

// GetFlag retrieves a flag (from cache if available)
func (s *FeatureFlagService) GetFlag(ctx context.Context, key string) (*FeatureFlag, error) {
	// Check cache first
	s.mu.RLock()
	if flag, exists := s.cache[key]; exists {
		s.mu.RUnlock()
		return flag, nil
	}
	s.mu.RUnlock()

	// Load from database
	var flag FeatureFlag
	var overridesJSON, metadataJSON []byte

	err := s.db.QueryRow(ctx, `
		SELECT key, enabled, description, overrides, metadata, created_at, updated_at
		FROM feature_flags
		WHERE key = $1
	`, key).Scan(
		&flag.Key,
		&flag.Enabled,
		&flag.Description,
		&overridesJSON,
		&metadataJSON,
		&flag.CreatedAt,
		&flag.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("flag not found")
	}

	// Parse JSON fields
	if err := json.Unmarshal(overridesJSON, &flag.Overrides); err != nil {
		flag.Overrides = make(map[int]bool)
	}
	if err := json.Unmarshal(metadataJSON, &flag.Metadata); err != nil {
		flag.Metadata = make(map[string]interface{})
	}

	// Update cache
	s.mu.Lock()
	s.cache[key] = &flag
	s.mu.Unlock()

	return &flag, nil
}

// SetFlag creates or updates a flag
func (s *FeatureFlagService) SetFlag(ctx context.Context, flag *FeatureFlag, changedBy int) error {
	overridesJSON, _ := json.Marshal(flag.Overrides)
	metadataJSON, _ := json.Marshal(flag.Metadata)

	_, err := s.db.Exec(ctx, `
		INSERT INTO feature_flags (key, enabled, description, overrides, metadata, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		ON CONFLICT (key) DO UPDATE
		SET enabled = $2, description = $3, overrides = $4, metadata = $5, updated_at = NOW()
	`, flag.Key, flag.Enabled, flag.Description, overridesJSON, metadataJSON)

	if err != nil {
		return fmt.Errorf("failed to set flag: %w", err)
	}

	// Log audit trail
	s.logAudit(ctx, flag.Key, changedBy, flag.Enabled)

	// Invalidate cache
	s.mu.Lock()
	delete(s.cache, flag.Key)
	s.mu.Unlock()

	return nil
}

// SetUserOverride sets a user-specific override
func (s *FeatureFlagService) SetUserOverride(ctx context.Context, key string, userID int, enabled bool, changedBy int) error {
	flag, err := s.GetFlag(ctx, key)
	if err != nil {
		return err
	}

	if flag.Overrides == nil {
		flag.Overrides = make(map[int]bool)
	}
	flag.Overrides[userID] = enabled

	return s.SetFlag(ctx, flag, changedBy)
}

// RemoveUserOverride removes a user-specific override
func (s *FeatureFlagService) RemoveUserOverride(ctx context.Context, key string, userID int, changedBy int) error {
	flag, err := s.GetFlag(ctx, key)
	if err != nil {
		return err
	}

	if flag.Overrides != nil {
		delete(flag.Overrides, userID)
	}

	return s.SetFlag(ctx, flag, changedBy)
}

// ListFlags returns all flags
func (s *FeatureFlagService) ListFlags(ctx context.Context) ([]*FeatureFlag, error) {
	rows, err := s.db.Query(ctx, `
		SELECT key, enabled, description, overrides, metadata, created_at, updated_at
		FROM feature_flags
		ORDER BY key
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var flags []*FeatureFlag
	for rows.Next() {
		var flag FeatureFlag
		var overridesJSON, metadataJSON []byte

		err := rows.Scan(
			&flag.Key,
			&flag.Enabled,
			&flag.Description,
			&overridesJSON,
			&metadataJSON,
			&flag.CreatedAt,
			&flag.UpdatedAt,
		)
		if err != nil {
			continue
		}

		json.Unmarshal(overridesJSON, &flag.Overrides)
		json.Unmarshal(metadataJSON, &flag.Metadata)

		flags = append(flags, &flag)
	}

	return flags, nil
}

// logAudit logs flag changes to audit table
func (s *FeatureFlagService) logAudit(ctx context.Context, key string, changedBy int, enabled bool) {
	_, err := s.db.Exec(ctx, `
		INSERT INTO feature_flag_audit (flag_key, changed_by, enabled, changed_at)
		VALUES ($1, $2, $3, NOW())
	`, key, changedBy, enabled)

	if err != nil {
		log.Printf("Failed to log feature flag audit: %v", err)
	}
}

// refreshCache periodically reloads all flags from database
func (s *FeatureFlagService) refreshCache() {
	ticker := time.NewTicker(s.ttl)
	defer ticker.Stop()

	for range ticker.C {
		ctx := context.Background()
		flags, err := s.ListFlags(ctx)
		if err != nil {
			log.Printf("Failed to refresh feature flag cache: %v", err)
			continue
		}

		s.mu.Lock()
		s.cache = make(map[string]*FeatureFlag)
		for _, flag := range flags {
			s.cache[flag.Key] = flag
		}
		s.mu.Unlock()
	}
}

// GetAuditLog returns recent changes to a flag
func (s *FeatureFlagService) GetAuditLog(ctx context.Context, key string, limit int) ([]AuditEntry, error) {
	rows, err := s.db.Query(ctx, `
		SELECT a.flag_key, a.changed_by, u.username, a.enabled, a.changed_at
		FROM feature_flag_audit a
		LEFT JOIN users u ON a.changed_by = u.id
		WHERE a.flag_key = $1
		ORDER BY a.changed_at DESC
		LIMIT $2
	`, key, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []AuditEntry
	for rows.Next() {
		var entry AuditEntry
		err := rows.Scan(&entry.FlagKey, &entry.ChangedBy, &entry.Username, &entry.Enabled, &entry.ChangedAt)
		if err != nil {
			continue
		}
		entries = append(entries, entry)
	}

	return entries, nil
}

type AuditEntry struct {
	FlagKey   string    `json:"flag_key"`
	ChangedBy int       `json:"changed_by"`
	Username  string    `json:"username"`
	Enabled   bool      `json:"enabled"`
	ChangedAt time.Time `json:"changed_at"`
}

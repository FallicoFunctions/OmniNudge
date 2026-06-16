package services

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"regexp"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/websocket"
	"github.com/redis/go-redis/v9"
	zlog "github.com/rs/zerolog/log"
)

// FeatureFlagService manages feature flags with Redis caching and percentage rollout
type FeatureFlagService struct {
	repo  *repository.FeatureFlagRepository
	redis *redis.Client
	hub   *websocket.Hub
	env   string // Current environment: "dev", "staging", "prod"
}

// Cache key constants
const (
	cacheFlagMeta   = "flag:meta:%s"           // flag:meta:feature_groups
	cacheFlagResult = "flag:result:%s:user:%d" // flag:result:feature_groups:user:123
	cacheFlagsList  = "flags:all:%s"           // flags:all:prod
	cacheTTL        = 5 * time.Minute
)

// NewFeatureFlagService creates a new feature flag service
func NewFeatureFlagService(repo *repository.FeatureFlagRepository, redisClient *redis.Client, hub *websocket.Hub, environment string) *FeatureFlagService {
	if environment == "" {
		environment = "prod"
	}
	return &FeatureFlagService{
		repo:  repo,
		redis: redisClient,
		hub:   hub,
		env:   environment,
	}
}

// IsEnabled checks if a feature flag is enabled for a user
func (s *FeatureFlagService) IsEnabled(ctx context.Context, key string, userID *int64) (bool, error) {
	// 1. Try cache first (if userID provided)
	if userID != nil && s.redis != nil {
		cacheKey := fmt.Sprintf(cacheFlagResult, key, *userID)
		if cached, err := s.redis.Get(ctx, cacheKey).Bool(); err == nil {
			return cached, nil
		}
	}

	// 2. Get flag from DB (with Redis cache fallback)
	flag, err := s.GetFeatureFlag(ctx, key)
	if err != nil {
		return false, err
	}
	// Flag not found — treat as disabled rather than panicking
	if flag == nil {
		return false, nil
	}

	// 3. Check environment match
	if flag.Environment != "all" && flag.Environment != s.env {
		return false, nil
	}

	// 4. Check user override (if userID provided)
	if userID != nil {
		override, err := s.repo.GetUserOverride(ctx, key, *userID)
		if err != nil {
			return false, err
		}
		if override != nil {
			result := *override
			s.cacheResult(ctx, key, *userID, result)
			return result, nil
		}
	}

	// 5. Check percentage rollout (only if enabled=true and userID provided)
	if flag.Enabled && flag.Percentage != nil && userID != nil {
		bucket := bucketUser(*userID)
		result := bucket < *flag.Percentage
		s.cacheResult(ctx, key, *userID, result)
		return result, nil
	}

	// 6. Return global enabled value
	if userID != nil {
		s.cacheResult(ctx, key, *userID, flag.Enabled)
	}
	return flag.Enabled, nil
}

// bucketUser uses FNV-1a hash for consistent bucketing (0-99)
func bucketUser(userID int64) int {
	h := fnv.New32a()
	_ = binary.Write(h, binary.BigEndian, userID)
	return int(h.Sum32() % 100)
}

// CreateFlag creates a new feature flag
func (s *FeatureFlagService) CreateFlag(ctx context.Context, flag *models.FeatureFlag, createdBy int64) error {
	if err := validateFlagKey(flag.Key); err != nil {
		return err
	}

	if flag.Environment == "" {
		flag.Environment = "all"
	}

	if err := s.repo.CreateFlag(ctx, flag); err != nil {
		return err
	}

	// Audit log
	audit := &models.FeatureFlagAudit{
		FlagKey:    flag.Key,
		ChangeType: "created",
		ChangedBy:  createdBy,
		NewValue:   map[string]interface{}{"enabled": flag.Enabled, "percentage": flag.Percentage},
	}
	s.createAuditLogIfPossible(ctx, audit)

	// Invalidate cache
	s.invalidateCache(ctx, flag.Key)

	return nil
}

// UpdateFlag updates a feature flag
func (s *FeatureFlagService) UpdateFlag(ctx context.Context, key string, updates map[string]interface{}, changedBy int64) error {
	// Get current flag
	oldFlag, err := s.repo.GetFlag(ctx, key)
	if err != nil {
		return err
	}
	if oldFlag == nil {
		return fmt.Errorf("flag not found: %s", key)
	}

	// Apply updates
	newFlag := *oldFlag
	if enabled, ok := updates["enabled"].(bool); ok {
		newFlag.Enabled = enabled
	}
	if percentage, ok := updates["percentage"].(*int); ok {
		newFlag.Percentage = percentage
	}
	if description, ok := updates["description"].(string); ok {
		newFlag.Description = description
	}

	// Update DB
	if err := s.repo.UpdateFlag(ctx, &newFlag); err != nil {
		return err
	}

	// Audit log (track what changed)
	if oldFlag.Enabled != newFlag.Enabled {
		audit := &models.FeatureFlagAudit{
			FlagKey:    key,
			ChangeType: "enabled",
			ChangedBy:  changedBy,
			OldValue:   map[string]interface{}{"enabled": oldFlag.Enabled},
			NewValue:   map[string]interface{}{"enabled": newFlag.Enabled},
		}
		s.createAuditLogIfPossible(ctx, audit)
	}

	if oldFlag.Percentage != newFlag.Percentage {
		audit := &models.FeatureFlagAudit{
			FlagKey:    key,
			ChangeType: "percentage_changed",
			ChangedBy:  changedBy,
			OldValue:   map[string]interface{}{"percentage": oldFlag.Percentage},
			NewValue:   map[string]interface{}{"percentage": newFlag.Percentage},
		}
		s.createAuditLogIfPossible(ctx, audit)
	}

	// Invalidate cache (best-effort, ignore Redis errors)
	s.invalidateCache(ctx, key)

	// Broadcast WebSocket event (includes percentage)
	if s.hub != nil {
		s.hub.BroadcastFeatureFlagUpdate(key, newFlag.Enabled, newFlag.Percentage)
	}

	return nil
}

// DeleteFlag removes a feature flag
func (s *FeatureFlagService) DeleteFlag(ctx context.Context, key string, deletedBy int64) error {
	if err := s.repo.DeleteFlag(ctx, key); err != nil {
		return err
	}

	// Audit log
	audit := &models.FeatureFlagAudit{
		FlagKey:    key,
		ChangeType: "deleted",
		ChangedBy:  deletedBy,
	}
	s.createAuditLogIfPossible(ctx, audit)

	// Invalidate cache
	s.invalidateCache(ctx, key)

	return nil
}

// SetUserOverride sets a per-user override
func (s *FeatureFlagService) SetUserOverride(ctx context.Context, key string, userID int64, enabled bool, changedBy int64) error {
	if err := s.repo.SetUserOverride(ctx, key, userID, enabled); err != nil {
		return err
	}

	// Audit log
	audit := &models.FeatureFlagAudit{
		FlagKey:    key,
		ChangeType: "override_set",
		ChangedBy:  changedBy,
		NewValue:   map[string]interface{}{"user_id": userID, "enabled": enabled},
	}
	s.createAuditLogIfPossible(ctx, audit)

	// Invalidate cache for this user
	if s.redis != nil {
		cacheKey := fmt.Sprintf(cacheFlagResult, key, userID)
		s.redis.Del(ctx, cacheKey) // Ignore errors
	}

	return nil
}

// RemoveUserOverride removes a per-user override
func (s *FeatureFlagService) RemoveUserOverride(ctx context.Context, key string, userID int64, changedBy int64) error {
	if err := s.repo.RemoveUserOverride(ctx, key, userID); err != nil {
		return err
	}

	// Audit log
	audit := &models.FeatureFlagAudit{
		FlagKey:    key,
		ChangeType: "override_removed",
		ChangedBy:  changedBy,
		OldValue:   map[string]interface{}{"user_id": userID},
	}
	s.createAuditLogIfPossible(ctx, audit)

	// Invalidate cache for this user
	if s.redis != nil {
		cacheKey := fmt.Sprintf(cacheFlagResult, key, userID)
		s.redis.Del(ctx, cacheKey) // Ignore errors
	}

	return nil
}

// ListFlags returns all flags for the current environment
func (s *FeatureFlagService) ListFlags(ctx context.Context) ([]*models.FeatureFlag, error) {
	// Try cache first
	cacheKey := fmt.Sprintf(cacheFlagsList, s.env)
	if s.redis != nil {
		if cached, err := s.redis.Get(ctx, cacheKey).Result(); err == nil {
			var flags []*models.FeatureFlag
			if json.Unmarshal([]byte(cached), &flags) == nil {
				return flags, nil
			}
		}
	}

	// Fallback to DB
	flags, err := s.repo.ListFlags(ctx, s.env)
	if err != nil {
		return nil, err
	}

	// Cache result (best-effort)
	if s.redis != nil {
		if data, err := json.Marshal(flags); err == nil {
			s.redis.Set(ctx, cacheKey, data, cacheTTL)
		}
	}

	return flags, nil
}

// GetUserFlags returns only enabled flags for a specific user
func (s *FeatureFlagService) GetUserFlags(ctx context.Context, userID int64) (map[string]bool, error) {
	flags, err := s.ListFlags(ctx)
	if err != nil {
		return nil, err
	}

	result := make(map[string]bool)
	for _, flag := range flags {
		enabled, err := s.IsEnabled(ctx, flag.Key, &userID)
		if err == nil && enabled {
			result[flag.Key] = true
		}
	}

	return result, nil
}

// GetAuditLog retrieves audit log for a flag
func (s *FeatureFlagService) GetAuditLog(ctx context.Context, key string, limit int) ([]*models.FeatureFlagAudit, error) {
	return s.repo.GetAuditLog(ctx, key, limit)
}

func (s *FeatureFlagService) createAuditLogIfPossible(ctx context.Context, audit *models.FeatureFlagAudit) {
	if audit.ChangedBy <= 0 {
		actorID, err := s.repo.GetAnyUserID(ctx)
		if err != nil {
			// Preserve primary feature-flag mutation path when no actor can be resolved.
			return
		}
		audit.ChangedBy = actorID
	}
	_ = s.repo.CreateAuditLog(ctx, audit)
}

// Helper methods

// GetFeatureFlag retrieves a flag with Redis caching
func (s *FeatureFlagService) GetFeatureFlag(ctx context.Context, key string) (*models.FeatureFlag, error) {
	// Try Redis cache first
	cacheKey := fmt.Sprintf(cacheFlagMeta, key)
	if s.redis != nil {
		if cached, err := s.redis.Get(ctx, cacheKey).Result(); err == nil {
			var flag models.FeatureFlag
			if json.Unmarshal([]byte(cached), &flag) == nil {
				return &flag, nil
			}
		}
	}

	// Fallback to DB
	flag, err := s.repo.GetFlag(ctx, key)
	if err != nil {
		return nil, err
	}

	// Cache in Redis (best-effort)
	if s.redis != nil {
		if data, err := json.Marshal(flag); err == nil {
			s.redis.Set(ctx, cacheKey, data, cacheTTL)
		}
	}

	return flag, nil
}

// cacheResult caches the result of IsEnabled for a user
func (s *FeatureFlagService) cacheResult(ctx context.Context, key string, userID int64, result bool) {
	if s.redis == nil {
		return
	}
	cacheKey := fmt.Sprintf(cacheFlagResult, key, userID)
	s.redis.Set(ctx, cacheKey, result, cacheTTL) // Ignore errors
}

// invalidateCache invalidates all cache entries for a flag
func (s *FeatureFlagService) invalidateCache(ctx context.Context, key string) {
	if s.redis == nil {
		return
	}
	// Delete flag metadata
	s.redis.Del(ctx, fmt.Sprintf(cacheFlagMeta, key))

	// Delete all user results for this flag (pattern match)
	pattern := fmt.Sprintf("flag:result:%s:user:*", key)
	iter := s.redis.Scan(ctx, 0, pattern, 0).Iterator()
	for iter.Next(ctx) {
		s.redis.Del(ctx, iter.Val())
	}

	// Delete flags list cache
	s.redis.Del(ctx, fmt.Sprintf(cacheFlagsList, s.env))
}

// CheckAutoRollbacks scans all enabled flags with auto_rollback=true and disables any
// whose rollback thresholds are exceeded. It is intended to be called periodically
// (e.g. every 60 seconds) by a background goroutine.
func (s *FeatureFlagService) CheckAutoRollbacks(ctx context.Context) {
	flags, err := s.repo.GetFlagsWithAutoRollback(ctx)
	if err != nil {
		zlog.Error().Err(err).Msg("feature-flag auto-rollback: failed to load flags")
		return
	}
	if len(flags) == 0 {
		return
	}

	// Check table existence once per run, not per flag.
	analyticsAvailable, err := s.repo.AnalyticsEventsTableExists(ctx)
	if err != nil {
		zlog.Error().Err(err).Msg("feature-flag auto-rollback: could not check analytics_events table, skipping run")
		return
	}

	// Resolve system user ID once for all potential rollbacks this run.
	systemUserID := int64(1)
	if id, err := s.repo.GetAnyUserID(ctx); err != nil {
		zlog.Warn().Err(err).Msg("feature-flag auto-rollback: could not resolve system user, falling back to ID 1")
	} else {
		systemUserID = id
	}

	for _, flag := range flags {
		trigger := flag.Rollback
		if trigger == nil {
			continue
		}

		if !analyticsAvailable {
			continue
		}

		windowSeconds := trigger.WindowSeconds
		if windowSeconds <= 0 {
			windowSeconds = 60
			zlog.Warn().Str("flag", flag.Key).Msg("feature-flag auto-rollback: window_seconds not set, defaulting to 60s")
		}
		minSample := trigger.MinSampleSize
		if minSample <= 0 {
			minSample = 100
			zlog.Warn().Str("flag", flag.Key).Msg("feature-flag auto-rollback: min_sample_size not set, defaulting to 100")
		}

		rate, total, err := s.repo.GetFlagErrorRate(ctx, flag.Key, windowSeconds)
		if err != nil {
			zlog.Error().Err(err).Str("flag", flag.Key).Msg("feature-flag auto-rollback: error fetching error rate")
			continue
		}
		if total < int64(minSample) {
			continue
		}

		exceeded := false
		switch trigger.MetricType {
		case "error_rate":
			exceeded = rate >= trigger.Threshold
		case "crash_rate":
			exceeded = rate >= trigger.CrashRateThreshold
		}

		if !exceeded {
			continue
		}

		// Determine which threshold was exceeded for logging.
		threshold := trigger.Threshold
		if trigger.MetricType == "crash_rate" {
			threshold = trigger.CrashRateThreshold
		}

		// Disable the flag using an independent timeout so a cancelled rollbackCtx
		// does not abort mid-operation and leave the flag partially updated.
		disableCtx, disableCancel := context.WithTimeout(context.Background(), 15*time.Second)
		updateErr := s.UpdateFlag(disableCtx, flag.Key, map[string]interface{}{"enabled": false}, systemUserID)
		disableCancel()
		if updateErr != nil {
			zlog.Error().Err(updateErr).Str("flag", flag.Key).Msg("feature-flag auto-rollback: failed to disable flag")
			continue
		}
		zlog.Warn().
			Str("flag", flag.Key).
			Str("metric", trigger.MetricType).
			Float64("rate", rate).
			Float64("threshold", threshold).
			Int64("sample", total).
			Msg("feature-flag auto-rollback triggered")

		// Audit log the auto-rollback
		s.createAuditLogIfPossible(ctx, &models.FeatureFlagAudit{
			FlagKey:    flag.Key,
			ChangeType: "auto_rollback",
			ChangedBy:  systemUserID,
			OldValue:   map[string]interface{}{"enabled": true},
			NewValue: map[string]interface{}{
				"enabled":    false,
				"reason":     "auto_rollback_triggered",
				"metric":     trigger.MetricType,
				"rate":       rate,
				"threshold":  trigger.Threshold,
				"sample":     total,
				"window_sec": windowSeconds,
			},
		})
	}
}

// validateFlagKey validates flag key format
func validateFlagKey(key string) error {
	if len(key) < 3 || len(key) > 50 {
		return errors.New("flag key must be 3-50 characters")
	}
	if !regexp.MustCompile(`^[a-z][a-z0-9_]*$`).MatchString(key) {
		return errors.New("flag key must be lowercase with underscores")
	}
	return nil
}

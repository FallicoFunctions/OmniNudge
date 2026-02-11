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
	if userID != nil {
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
	binary.Write(h, binary.BigEndian, userID)
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
	s.repo.CreateAuditLog(ctx, audit)

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
		s.repo.CreateAuditLog(ctx, audit)
	}

	if oldFlag.Percentage != newFlag.Percentage {
		audit := &models.FeatureFlagAudit{
			FlagKey:    key,
			ChangeType: "percentage_changed",
			ChangedBy:  changedBy,
			OldValue:   map[string]interface{}{"percentage": oldFlag.Percentage},
			NewValue:   map[string]interface{}{"percentage": newFlag.Percentage},
		}
		s.repo.CreateAuditLog(ctx, audit)
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
	s.repo.CreateAuditLog(ctx, audit)

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
	s.repo.CreateAuditLog(ctx, audit)

	// Invalidate cache for this user
	cacheKey := fmt.Sprintf(cacheFlagResult, key, userID)
	s.redis.Del(ctx, cacheKey) // Ignore errors

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
	s.repo.CreateAuditLog(ctx, audit)

	// Invalidate cache for this user
	cacheKey := fmt.Sprintf(cacheFlagResult, key, userID)
	s.redis.Del(ctx, cacheKey) // Ignore errors

	return nil
}

// ListFlags returns all flags for the current environment
func (s *FeatureFlagService) ListFlags(ctx context.Context) ([]*models.FeatureFlag, error) {
	// Try cache first
	cacheKey := fmt.Sprintf(cacheFlagsList, s.env)
	if cached, err := s.redis.Get(ctx, cacheKey).Result(); err == nil {
		var flags []*models.FeatureFlag
		if json.Unmarshal([]byte(cached), &flags) == nil {
			return flags, nil
		}
	}

	// Fallback to DB
	flags, err := s.repo.ListFlags(ctx, s.env)
	if err != nil {
		return nil, err
	}

	// Cache result (best-effort)
	if data, err := json.Marshal(flags); err == nil {
		s.redis.Set(ctx, cacheKey, data, cacheTTL)
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

// Helper methods

// GetFeatureFlag retrieves a flag with Redis caching
func (s *FeatureFlagService) GetFeatureFlag(ctx context.Context, key string) (*models.FeatureFlag, error) {
	// Try Redis cache first
	cacheKey := fmt.Sprintf(cacheFlagMeta, key)
	if cached, err := s.redis.Get(ctx, cacheKey).Result(); err == nil {
		var flag models.FeatureFlag
		if json.Unmarshal([]byte(cached), &flag) == nil {
			return &flag, nil
		}
	}

	// Fallback to DB
	flag, err := s.repo.GetFlag(ctx, key)
	if err != nil {
		return nil, err
	}

	// Cache in Redis (best-effort)
	if data, err := json.Marshal(flag); err == nil {
		s.redis.Set(ctx, cacheKey, data, cacheTTL)
	}

	return flag, nil
}

// cacheResult caches the result of IsEnabled for a user
func (s *FeatureFlagService) cacheResult(ctx context.Context, key string, userID int64, result bool) {
	cacheKey := fmt.Sprintf(cacheFlagResult, key, userID)
	s.redis.Set(ctx, cacheKey, result, cacheTTL) // Ignore errors
}

// invalidateCache invalidates all cache entries for a flag
func (s *FeatureFlagService) invalidateCache(ctx context.Context, key string) {
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

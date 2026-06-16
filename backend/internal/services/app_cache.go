package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// AppCache provides domain-specific caching with fallback support
type AppCache struct {
	cache Cache
}

// NewAppCache creates a new application cache
func NewAppCache(cache Cache) *AppCache {
	return &AppCache{cache: cache}
}

// Cache key prefixes (P0-006)
const (
	CacheKeyUser           = "user:%d"                           // user:123
	CacheKeyUserProfile    = "user:%d:profile"                   // user:123:profile
	CacheKeyGroupMembers   = "group:%d:members"                  // group:456:members
	CacheKeyGroupKey       = "group:%d:key:v%d"                  // group:456:key:v1
	CacheKeyConversation   = "conversation:%d"                   // conversation:789
	CacheKeyUserPublicKey  = "user:%d:publickey"                 // user:123:publickey
	CacheKeyOnlineStatus   = "user:%d:online"                    // user:123:online
	CacheKeyUnreadCount    = "user:%d:unread"                    // user:123:unread
	CacheKeyHubModerators  = "hub:%d:moderators"                 // hub:101:moderators
	CacheKeyHubSettings    = "hub:%d:settings"                   // hub:101:settings
)

// TTL values for different data types (P0-006)
const (
	TTLUserProfile      = 5 * time.Minute  // User profiles change infrequently
	TTLGroupMembers     = 1 * time.Minute  // Group memberships more volatile
	TTLGroupKey         = 10 * time.Minute // Encryption keys cached longer
	TTLConversation     = 2 * time.Minute  // Conversation metadata
	TTLPublicKey        = 30 * time.Minute // Public keys rarely change
	TTLOnlineStatus     = 30 * time.Second // Online status highly volatile
	TTLUnreadCount      = 1 * time.Minute  // Unread counts change frequently
	TTLHubModerators    = 5 * time.Minute  // Moderator list stable
	TTLHubSettings      = 10 * time.Minute // Hub settings very stable
)

// CacheStats tracks cache performance metrics
type CacheStats struct {
	Hits   int64
	Misses int64
}

// GetUser retrieves a cached user
func (c *AppCache) GetUser(ctx context.Context, userID int) (map[string]interface{}, bool, error) {
	key := fmt.Sprintf(CacheKeyUser, userID)
	value, hit, err := c.cache.Get(ctx, key)
	if err != nil || !hit {
		return nil, false, err
	}

	var user map[string]interface{}
	if err := json.Unmarshal([]byte(value), &user); err != nil {
		return nil, false, err
	}

	return user, true, nil
}

// SetUser caches a user
func (c *AppCache) SetUser(ctx context.Context, userID int, user interface{}) error {
	key := fmt.Sprintf(CacheKeyUser, userID)
	data, err := json.Marshal(user)
	if err != nil {
		return err
	}
	return c.cache.Set(ctx, key, string(data), TTLUserProfile)
}

// InvalidateUser removes a user from cache
func (c *AppCache) InvalidateUser(ctx context.Context, userID int) error {
	// Note: Current cache interface doesn't have Delete
	// Workaround: set empty value with 1 second TTL
	key := fmt.Sprintf(CacheKeyUser, userID)
	return c.cache.Set(ctx, key, "", 1*time.Second)
}

// GetUserProfile retrieves cached user profile
func (c *AppCache) GetUserProfile(ctx context.Context, userID int) (map[string]interface{}, bool, error) {
	key := fmt.Sprintf(CacheKeyUserProfile, userID)
	value, hit, err := c.cache.Get(ctx, key)
	if err != nil || !hit {
		return nil, false, err
	}

	var profile map[string]interface{}
	if err := json.Unmarshal([]byte(value), &profile); err != nil {
		return nil, false, err
	}

	return profile, true, nil
}

// SetUserProfile caches user profile
func (c *AppCache) SetUserProfile(ctx context.Context, userID int, profile interface{}) error {
	key := fmt.Sprintf(CacheKeyUserProfile, userID)
	data, err := json.Marshal(profile)
	if err != nil {
		return err
	}
	return c.cache.Set(ctx, key, string(data), TTLUserProfile)
}

// GetGroupMembers retrieves cached group members
func (c *AppCache) GetGroupMembers(ctx context.Context, groupID int) ([]int, bool, error) {
	key := fmt.Sprintf(CacheKeyGroupMembers, groupID)
	value, hit, err := c.cache.Get(ctx, key)
	if err != nil || !hit {
		return nil, false, err
	}

	var members []int
	if err := json.Unmarshal([]byte(value), &members); err != nil {
		return nil, false, err
	}

	return members, true, nil
}

// SetGroupMembers caches group members
func (c *AppCache) SetGroupMembers(ctx context.Context, groupID int, members []int) error {
	key := fmt.Sprintf(CacheKeyGroupMembers, groupID)
	data, err := json.Marshal(members)
	if err != nil {
		return err
	}
	return c.cache.Set(ctx, key, string(data), TTLGroupMembers)
}

// InvalidateGroupMembers removes group members from cache
func (c *AppCache) InvalidateGroupMembers(ctx context.Context, groupID int) error {
	key := fmt.Sprintf(CacheKeyGroupMembers, groupID)
	return c.cache.Set(ctx, key, "", 1*time.Second)
}

// GetGroupKey retrieves cached group encryption key
func (c *AppCache) GetGroupKey(ctx context.Context, groupID int, version int) (string, bool, error) {
	key := fmt.Sprintf(CacheKeyGroupKey, groupID, version)
	return c.cache.Get(ctx, key)
}

// SetGroupKey caches group encryption key
func (c *AppCache) SetGroupKey(ctx context.Context, groupID int, version int, encryptedKey string) error {
	key := fmt.Sprintf(CacheKeyGroupKey, groupID, version)
	return c.cache.Set(ctx, key, encryptedKey, TTLGroupKey)
}

// GetPublicKey retrieves cached user public key
func (c *AppCache) GetPublicKey(ctx context.Context, userID int) (string, bool, error) {
	key := fmt.Sprintf(CacheKeyUserPublicKey, userID)
	return c.cache.Get(ctx, key)
}

// SetPublicKey caches user public key
func (c *AppCache) SetPublicKey(ctx context.Context, userID int, publicKey string) error {
	key := fmt.Sprintf(CacheKeyUserPublicKey, userID)
	return c.cache.Set(ctx, key, publicKey, TTLPublicKey)
}

// GetOnlineStatus retrieves cached online status
func (c *AppCache) GetOnlineStatus(ctx context.Context, userID int) (bool, bool, error) {
	key := fmt.Sprintf(CacheKeyOnlineStatus, userID)
	value, hit, err := c.cache.Get(ctx, key)
	if err != nil || !hit {
		return false, false, err
	}
	return value == "1", true, nil
}

// SetOnlineStatus caches online status
func (c *AppCache) SetOnlineStatus(ctx context.Context, userID int, isOnline bool) error {
	key := fmt.Sprintf(CacheKeyOnlineStatus, userID)
	value := "0"
	if isOnline {
		value = "1"
	}
	return c.cache.Set(ctx, key, value, TTLOnlineStatus)
}

// GetUnreadCount retrieves cached unread count
func (c *AppCache) GetUnreadCount(ctx context.Context, userID int) (int, bool, error) {
	key := fmt.Sprintf(CacheKeyUnreadCount, userID)
	value, hit, err := c.cache.Get(ctx, key)
	if err != nil || !hit {
		return 0, false, err
	}

	var count int
	if err := json.Unmarshal([]byte(value), &count); err != nil {
		return 0, false, err
	}

	return count, true, nil
}

// SetUnreadCount caches unread count
func (c *AppCache) SetUnreadCount(ctx context.Context, userID int, count int) error {
	key := fmt.Sprintf(CacheKeyUnreadCount, userID)
	data, err := json.Marshal(count)
	if err != nil {
		return err
	}
	return c.cache.Set(ctx, key, string(data), TTLUnreadCount)
}

// InvalidateUnreadCount removes unread count from cache
func (c *AppCache) InvalidateUnreadCount(ctx context.Context, userID int) error {
	key := fmt.Sprintf(CacheKeyUnreadCount, userID)
	return c.cache.Set(ctx, key, "", 1*time.Second)
}

// GetHubModerators retrieves cached hub moderators
func (c *AppCache) GetHubModerators(ctx context.Context, hubID int) ([]int, bool, error) {
	key := fmt.Sprintf(CacheKeyHubModerators, hubID)
	value, hit, err := c.cache.Get(ctx, key)
	if err != nil || !hit {
		return nil, false, err
	}

	var moderators []int
	if err := json.Unmarshal([]byte(value), &moderators); err != nil {
		return nil, false, err
	}

	return moderators, true, nil
}

// SetHubModerators caches hub moderators
func (c *AppCache) SetHubModerators(ctx context.Context, hubID int, moderators []int) error {
	key := fmt.Sprintf(CacheKeyHubModerators, hubID)
	data, err := json.Marshal(moderators)
	if err != nil {
		return err
	}
	return c.cache.Set(ctx, key, string(data), TTLHubModerators)
}

// InvalidateHubModerators removes hub moderators from cache
func (c *AppCache) InvalidateHubModerators(ctx context.Context, hubID int) error {
	key := fmt.Sprintf(CacheKeyHubModerators, hubID)
	return c.cache.Set(ctx, key, "", 1*time.Second)
}

// CacheAside implements cache-aside pattern
// Tries cache first, falls back to fetch function, then caches result
func CacheAside[T any](
	ctx context.Context,
	cache Cache,
	key string,
	ttl time.Duration,
	fetch func(ctx context.Context) (T, error),
) (T, error) {
	var zero T

	// Try cache first
	value, hit, err := cache.Get(ctx, key)
	if err == nil && hit {
		var result T
		if err := json.Unmarshal([]byte(value), &result); err == nil {
			return result, nil
		}
	}

	// Cache miss - fetch from source
	result, err := fetch(ctx)
	if err != nil {
		return zero, err
	}

	// Cache the result (async, don't block on cache failure)
	go func() {
		data, err := json.Marshal(result)
		if err == nil {
			_ = cache.Set(context.Background(), key, string(data), ttl)
		}
	}()

	return result, nil
}

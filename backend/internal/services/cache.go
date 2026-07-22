package services

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/omninudge/backend/internal/metrics"
)

// Cache defines minimal cache operations
type Cache interface {
	Get(ctx context.Context, key string) (string, bool, error)
	Set(ctx context.Context, key string, value string, ttl time.Duration) error
}

// AtomicCounter increments a fixed-window counter without a read/modify/write
// race. Distributed rate limiting relies on this optional cache capability.
type AtomicCounter interface {
	IncrementWithTTL(ctx context.Context, key string, ttl time.Duration) (int64, error)
}

// NoopCache is a no-op cache implementation
type NoopCache struct{}

func (NoopCache) Get(ctx context.Context, key string) (string, bool, error) { return "", false, nil }
func (NoopCache) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	return nil
}
func (NoopCache) IncrementWithTTL(context.Context, string, time.Duration) (int64, error) {
	return 1, nil
}

// defaultMemoryCacheMaxSize is the default maximum number of entries in a
// MemoryCache. When the limit is reached, Set silently drops the new entry
// rather than evicting an existing one (no LRU). Tune via NewMemoryCacheWithMax.
const defaultMemoryCacheMaxSize = 10_000

// MemoryCache is a simple in-memory cache with TTL support and an entry-count cap.
// Call Stop() to release the background cleanup goroutine when the cache is
// no longer needed (e.g. during server shutdown or in tests).
type MemoryCache struct {
	data    map[string]*cacheEntry
	maxSize int
	mutex   sync.RWMutex
	stopCh  chan struct{}
}

type cacheEntry struct {
	value      string
	expiration time.Time
}

// NewMemoryCache creates an in-memory cache with a default cap of 10,000 entries
// and starts a background cleanup goroutine that evicts expired entries every
// minute. Call Stop() to terminate the goroutine when the cache is no longer needed.
func NewMemoryCache() *MemoryCache {
	return NewMemoryCacheWithMax(defaultMemoryCacheMaxSize)
}

// NewMemoryCacheWithMax creates a MemoryCache with a custom entry cap.
// When the cache reaches maxSize entries, new Set calls are silently dropped
// until the cleanup goroutine evicts expired entries.
func NewMemoryCacheWithMax(maxSize int) *MemoryCache {
	if maxSize <= 0 {
		maxSize = defaultMemoryCacheMaxSize
	}
	cache := &MemoryCache{
		data:    make(map[string]*cacheEntry, maxSize),
		maxSize: maxSize,
		stopCh:  make(chan struct{}),
	}
	go cache.cleanup()
	return cache
}

// Stop terminates the background cleanup goroutine. It is safe to call
// multiple times; subsequent calls are no-ops.
func (m *MemoryCache) Stop() {
	select {
	case <-m.stopCh:
		// already stopped
	default:
		close(m.stopCh)
	}
}

func (m *MemoryCache) Get(ctx context.Context, key string) (string, bool, error) {
	// Fast path: entry exists and is not expired.
	m.mutex.RLock()
	entry, exists := m.data[key]
	m.mutex.RUnlock()

	if !exists {
		return "", false, nil
	}
	if !time.Now().After(entry.expiration) {
		// Entry is still valid. The pointer was read under the RLock and the
		// underlying struct is never mutated after insertion, so this is safe.
		return entry.value, true, nil
	}

	// Lazy eviction: entry exists but has expired.
	// Acquire write lock and re-check: a concurrent Set may have refreshed the
	// entry between the RUnlock above and now.
	m.mutex.Lock()
	if e, ok := m.data[key]; ok && time.Now().After(e.expiration) {
		delete(m.data, key)
	}
	m.mutex.Unlock()
	return "", false, nil
}

func (m *MemoryCache) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	// Allow overwriting an existing key regardless of size (it does not grow the map).
	// If the map is at capacity and this is a new key, drop silently rather than
	// evicting an existing entry — this avoids the complexity of LRU bookkeeping.
	_, exists := m.data[key]
	if !exists && len(m.data) >= m.maxSize {
		return nil
	}

	m.data[key] = &cacheEntry{
		value:      value,
		expiration: time.Now().Add(ttl),
	}

	return nil
}

func (m *MemoryCache) IncrementWithTTL(_ context.Context, key string, ttl time.Duration) (int64, error) {
	if ttl <= 0 {
		return 0, fmt.Errorf("MemoryCache.IncrementWithTTL: ttl must be positive, got %v", ttl)
	}
	m.mutex.Lock()
	defer m.mutex.Unlock()
	now := time.Now()
	if entry, exists := m.data[key]; exists && now.Before(entry.expiration) {
		count, err := strconv.ParseInt(entry.value, 10, 64)
		if err != nil || count < 0 {
			return 0, errors.New("memory cache counter contains an invalid value")
		}
		count++
		m.data[key] = &cacheEntry{value: strconv.FormatInt(count, 10), expiration: entry.expiration}
		return count, nil
	}
	if _, exists := m.data[key]; !exists && len(m.data) >= m.maxSize {
		return 0, errors.New("memory cache is at capacity")
	}
	m.data[key] = &cacheEntry{value: "1", expiration: now.Add(ttl)}
	return 1, nil
}

// cleanup removes expired entries every minute until Stop() is called.
func (m *MemoryCache) cleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			m.mutex.Lock()
			now := time.Now()
			for key, entry := range m.data {
				if now.After(entry.expiration) {
					delete(m.data, key)
				}
			}
			m.mutex.Unlock()
		}
	}
}

// keyPrefix returns the first colon-delimited segment of a cache key,
// used as the key_prefix Prometheus label.
// e.g. "reddit:subreddit:golang" → "reddit"
func keyPrefix(key string) string {
	if idx := strings.Index(key, ":"); idx > 0 {
		return key[:idx]
	}
	return key
}

// InstrumentedCache wraps any Cache implementation and records Prometheus
// hit/miss metrics broken down by cache type and key prefix.
type InstrumentedCache struct {
	inner     Cache
	cacheType string // fixed at construction; used as a Prometheus label (e.g. "redis", "memory")
}

// NewInstrumentedCache creates an InstrumentedCache wrapping inner.
func NewInstrumentedCache(inner Cache, cacheType string) *InstrumentedCache {
	return &InstrumentedCache{inner: inner, cacheType: cacheType}
}

// Get delegates to the inner cache and records a hit, miss, or error metric.
func (ic *InstrumentedCache) Get(ctx context.Context, key string) (string, bool, error) {
	prefix := keyPrefix(key)
	value, found, err := ic.inner.Get(ctx, key)
	if err != nil {
		metrics.CacheErrors.WithLabelValues(ic.cacheType, "get").Inc()
		return value, found, err
	}
	if found {
		metrics.CacheHits.WithLabelValues(ic.cacheType, prefix).Inc()
	} else {
		metrics.CacheMisses.WithLabelValues(ic.cacheType, prefix).Inc()
	}
	return value, found, nil
}

// Set delegates to the inner cache and records an error metric on failure.
func (ic *InstrumentedCache) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	if err := ic.inner.Set(ctx, key, value, ttl); err != nil {
		metrics.CacheErrors.WithLabelValues(ic.cacheType, "set").Inc()
		return err
	}
	return nil
}

func (ic *InstrumentedCache) IncrementWithTTL(ctx context.Context, key string, ttl time.Duration) (int64, error) {
	counter, ok := ic.inner.(AtomicCounter)
	if !ok {
		return 0, errors.New("cache does not support atomic counters")
	}
	count, err := counter.IncrementWithTTL(ctx, key, ttl)
	if err != nil {
		metrics.CacheErrors.WithLabelValues(ic.cacheType, "increment").Inc()
	}
	return count, err
}

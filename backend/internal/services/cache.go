package services

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
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

// NoopCache is a no-op cache implementation
type NoopCache struct{}

func (NoopCache) Get(ctx context.Context, key string) (string, bool, error) { return "", false, nil }
func (NoopCache) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	return nil
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

// RedisCache is a lightweight Redis client using raw RESP for simple GET/SETEX.
//
// Deprecated: RedisCache opens a new TCP connection on every Get and Set call,
// making it unsuitable for any non-trivial production load (connection setup
// overhead + ephemeral port exhaustion). Use ResilientRedisCache instead,
// which wraps go-redis with a connection pool, circuit breaker, and singleflight.
// RedisCache is retained only for environments where go-redis cannot be imported.
type RedisCache struct {
	addr     string
	password string
	timeout  time.Duration
}

// NewRedisCache creates a Redis-backed cache.
//
// Deprecated: see RedisCache type comment. Use NewResilientRedisCache instead.
func NewRedisCache(addr, password string, timeout time.Duration) *RedisCache {
	return &RedisCache{
		addr:     addr,
		password: password,
		timeout:  timeout,
	}
}

func (r *RedisCache) dial(ctx context.Context) (net.Conn, error) {
	// r.timeout serves as BOTH the dial deadline AND the per-operation deadline
	// set on the connection after it is established. This means the total budget
	// for a Get/Set call is up to 2×r.timeout (dial + op). Pass a timeout that
	// is at most half of your desired end-to-end deadline.
	dialer := &net.Dialer{Timeout: r.timeout}
	conn, err := dialer.DialContext(ctx, "tcp", r.addr)
	if err != nil {
		return nil, err
	}
	_ = conn.SetDeadline(time.Now().Add(r.timeout))

	if r.password != "" {
		if err := writeCommand(conn, "AUTH", r.password); err != nil {
			conn.Close()
			return nil, err
		}
		if _, _, err := readReply(conn); err != nil {
			conn.Close()
			return nil, err
		}
	}

	return conn, nil
}

// Get returns value and hit bool
func (r *RedisCache) Get(ctx context.Context, key string) (string, bool, error) {
	conn, err := r.dial(ctx)
	if err != nil {
		return "", false, err
	}
	defer conn.Close()

	if err := writeCommand(conn, "GET", key); err != nil {
		return "", false, err
	}

	resp, ok, err := readReply(conn)
	if err != nil {
		return "", false, err
	}
	return resp, ok, nil
}

// Set sets value with TTL using SETEX.
// Returns an error if ttl is zero or negative — Redis SETEX requires a positive
// integer TTL and would return an error anyway; failing early gives a clearer message.
// Note: sub-second TTLs (e.g. 500ms) are truncated to whole seconds by SETEX.
// If you need sub-second expiry, use the PSETEX command instead (not supported here).
func (r *RedisCache) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	if ttl <= 0 {
		return fmt.Errorf("RedisCache.Set: ttl must be positive, got %v", ttl)
	}
	seconds := int64(ttl.Seconds())
	if seconds == 0 {
		// ttl was positive but less than 1 second — truncation would produce 0,
		// which Redis SETEX rejects. Round up to 1 second.
		seconds = 1
	}
	conn, err := r.dial(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	if err := writeCommand(conn, "SETEX", key, strconv.FormatInt(seconds, 10), value); err != nil {
		return err
	}
	_, _, err = readReply(conn)
	return err
}

func writeCommand(conn net.Conn, args ...string) error {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("*%d\r\n", len(args)))
	for _, arg := range args {
		b.WriteString(fmt.Sprintf("$%d\r\n%s\r\n", len(arg), arg))
	}
	_, err := conn.Write([]byte(b.String()))
	return err
}

// readReply handles simple string and bulk string
func readReply(conn net.Conn) (string, bool, error) {
	reader := bufio.NewReader(conn)
	line, err := reader.ReadString('\n')
	if err != nil {
		return "", false, err
	}
	if len(line) == 0 {
		return "", false, fmt.Errorf("empty redis reply")
	}
	switch line[0] {
	case '+': // simple string
		return strings.TrimSuffix(line[1:], "\r\n"), true, nil
	case '$': // bulk string
		sizeStr := strings.TrimSpace(line[1:])
		size, err := strconv.Atoi(sizeStr)
		if err != nil {
			return "", false, err
		}
		if size < -1 {
			return "", false, fmt.Errorf("invalid redis bulk string size: %d", size)
		}
		if size == -1 {
			return "", false, nil // nil bulk — key does not exist
		}
		buf := make([]byte, size+2) // include CRLF
		if _, err := io.ReadFull(reader, buf); err != nil {
			return "", false, err
		}
		return string(buf[:size]), true, nil
	case '-':
		return "", false, fmt.Errorf("redis error: %s", strings.TrimSpace(line[1:]))
	default:
		return "", false, fmt.Errorf("unexpected redis reply: %s", line)
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

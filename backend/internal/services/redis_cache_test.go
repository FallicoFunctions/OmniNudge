package services

import (
	"context"
	"testing"
	"time"

	"github.com/sony/gobreaker"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// These tests require a real Redis at localhost:6379.
// They are skipped when Redis is not reachable.

const testRedisAddr = "localhost:6379"

func newTestResilientCache(t *testing.T) *ResilientRedisCache {
	t.Helper()
	// Password is empty for local dev Redis; override via REDIS_PASSWORD env if needed.
	c := NewResilientRedisCache(testRedisAddr, "")
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	// Probe Redis — skip if unavailable.
	if err := c.client.Ping(ctx).Err(); err != nil {
		t.Skipf("Redis not available at %s: %v", testRedisAddr, err)
	}
	return c
}

func TestResilientRedisCache_SetAndGet(t *testing.T) {
	tests := []struct {
		name  string
		key   string
		value string
		ttl   time.Duration
	}{
		{name: "simple string", key: "test:rc:simple", value: "hello", ttl: 10 * time.Second},
		{name: "empty value", key: "test:rc:empty", value: "", ttl: 10 * time.Second},
		{name: "json-like value", key: "test:rc:json", value: `{"id":1}`, ttl: 10 * time.Second},
	}

	cache := newTestResilientCache(t)
	ctx := context.Background()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Ensure key is clean before test.
			_ = cache.client.Del(ctx, tc.key).Err()

			require.NoError(t, cache.Set(ctx, tc.key, tc.value, tc.ttl))

			got, found, err := cache.Get(ctx, tc.key)
			require.NoError(t, err)
			assert.True(t, found)
			assert.Equal(t, tc.value, got)

			// Cleanup.
			_ = cache.client.Del(ctx, tc.key).Err()
		})
	}
}

func TestResilientRedisCache_Miss(t *testing.T) {
	cache := newTestResilientCache(t)
	ctx := context.Background()

	_ = cache.client.Del(ctx, "test:rc:nonexistent").Err()

	val, found, err := cache.Get(ctx, "test:rc:nonexistent")
	require.NoError(t, err)
	assert.False(t, found)
	assert.Empty(t, val)
}

func TestResilientRedisCache_TTLExpiry(t *testing.T) {
	cache := newTestResilientCache(t)
	ctx := context.Background()

	key := "test:rc:ttl"
	_ = cache.client.Del(ctx, key).Err()

	require.NoError(t, cache.Set(ctx, key, "expire-me", 1*time.Second))

	// Should exist immediately.
	_, found, err := cache.Get(ctx, key)
	require.NoError(t, err)
	assert.True(t, found)

	// Wait for TTL to lapse.
	time.Sleep(1100 * time.Millisecond)

	_, found, err = cache.Get(ctx, key)
	require.NoError(t, err)
	assert.False(t, found, "key should have expired")
}

func TestResilientRedisCache_ConcurrentGet(t *testing.T) {
	// Verify that concurrent Get calls for the same missing key do not panic
	// and all return consistent results (all miss, all no error).
	//
	// NOTE: We cannot easily count the number of actual Redis calls from the
	// client side without injecting a spy. What we verify here is that:
	//   1. No goroutine panics.
	//   2. All 20 goroutines receive the same result (all miss or all hit).
	//   3. No errors are returned.
	// The singleflight behaviour (collapsing concurrent Redis GETs) is
	// structurally guaranteed by the singleflight.Group in Get().
	cache := newTestResilientCache(t)
	ctx := context.Background()

	key := "test:rc:concurrent"
	_ = cache.client.Del(ctx, key).Err()

	const goroutines = 20
	results := make(chan bool, goroutines)
	errs := make(chan error, goroutines)

	for i := 0; i < goroutines; i++ {
		go func() {
			_, found, err := cache.Get(ctx, key)
			results <- found
			errs <- err
		}()
	}

	for i := 0; i < goroutines; i++ {
		assert.NoError(t, <-errs)
		assert.False(t, <-results, "all goroutines should receive a cache miss for a deleted key")
	}
}

func TestResilientRedisCache_ImplementsCache(t *testing.T) {
	// Compile-time interface check.
	var _ Cache = (*ResilientRedisCache)(nil)
}

func TestIsCircuitOpen(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{name: "nil error", err: nil, expected: false},
		{name: "gobreaker open", err: errorOpen, expected: true},
		{name: "gobreaker too many requests", err: errorTooMany, expected: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.expected, isCircuitOpen(tc.err))
		})
	}
}

// sentinel errors used in TestIsCircuitOpen — pulled from gobreaker package.
var (
	errorOpen    = gobreaker.ErrOpenState
	errorTooMany = gobreaker.ErrTooManyRequests
)

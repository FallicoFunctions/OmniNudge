package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/sony/gobreaker"
	"golang.org/x/sync/singleflight"
)

// ResilientRedisCache is a Redis-backed cache with:
//   - gobreaker circuit breaker: opens after 5 consecutive Redis failures,
//     transitions to half-open after 30 s. While open, all operations are
//     treated as cache misses so callers fall back to the database.
//   - singleflight.Group: deduplicates concurrent Redis GETs for the same key
//     so only one in-flight Redis call is made at a time (prevents Redis
//     stampede). NOTE: this does NOT prevent downstream database stampedes —
//     on a cache miss all waiting goroutines still independently query the DB.
//     Callers requiring full thundering-herd prevention must wrap their own
//     fetch-and-set logic in a singleflight.Group.
type ResilientRedisCache struct {
	client  *redis.Client
	breaker *gobreaker.CircuitBreaker
	sfGroup singleflight.Group
}

// NewResilientRedisCacheWithClient constructs a ResilientRedisCache that wraps
// an existing *redis.Client.  Use this when the caller already manages a Redis
// connection pool (e.g. the main server that also uses the client for job
// queues) to avoid opening a duplicate connection pool.
func NewResilientRedisCacheWithClient(client *redis.Client) *ResilientRedisCache {
	return newResilientRedisCache(client)
}

// NewResilientRedisCache constructs a ResilientRedisCache connected to addr.
// addr should be in "host:port" format (e.g. "localhost:6379").
// password is the Redis AUTH password; pass an empty string if not required.
//
// Prefer NewResilientRedisCacheWithClient when the caller already holds a
// *redis.Client to avoid opening a duplicate connection pool.
//
// Pool size note: go-redis defaults to PoolSize = 10 * runtime.GOMAXPROCS(0).
// On an 8-core machine that is 80 Redis connections. If you run multiple server
// replicas, size the pool explicitly to avoid exhausting Redis maxclients:
//   client := redis.NewClient(&redis.Options{..., PoolSize: 20})
//   cache := NewResilientRedisCacheWithClient(client)
func NewResilientRedisCache(addr, password string) *ResilientRedisCache {
	client := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           0,
		DialTimeout:  2 * time.Second,
		ReadTimeout:  1 * time.Second,
		WriteTimeout: 1 * time.Second,
	})
	return newResilientRedisCache(client)
}

// newResilientRedisCache is the shared constructor used by both public
// constructors. It builds the circuit breaker and wraps the provided client.
func newResilientRedisCache(client *redis.Client) *ResilientRedisCache {
	cb := gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name: "redis-cache",
		// MaxRequests=1: only 1 probe request is sent in half-open state before
		// deciding to re-close or re-open. This is intentionally strict: we prefer
		// a slightly longer recovery time over allowing a burst of requests to hit
		// a still-flaky Redis. If Redis has a consistent 30s+ outage, the single
		// successful probe on recovery is sufficient. If the probe fails, the
		// breaker re-opens immediately for another 30s (Timeout below).
		MaxRequests: 1,
		Interval:    60 * time.Second, // reset failure counts every 60 s in closed state
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= 5
		},
		OnStateChange: func(name string, from, to gobreaker.State) {
			slog.Info("redis circuit breaker state changed",
				slog.String("name", name),
				slog.String("from", from.String()),
				slog.String("to", to.String()),
			)
		},
	})

	return &ResilientRedisCache{
		client:  client,
		breaker: cb,
	}
}

// Close closes the underlying Redis client connection pool.
// It should be called when the server shuts down gracefully.
func (r *ResilientRedisCache) Close() error {
	return r.client.Close()
}

// isCircuitOpen reports whether err is a gobreaker open/half-open state error.
func isCircuitOpen(err error) bool {
	return errors.Is(err, gobreaker.ErrOpenState) ||
		errors.Is(err, gobreaker.ErrTooManyRequests)
}

// getResult is the internal type shared via singleflight for Get.
type getResult struct {
	value string
	found bool
}

// Get retrieves a cached value by key.
//   - Hit: returns (value, true, nil)
//   - Miss: returns ("", false, nil)
//   - Circuit open: returns ("", false, nil) — caller should fetch from DB
//   - Redis error: returns ("", false, err)
//
// IMPORTANT: singleflight here collapses concurrent Redis GETs for the same key
// so only one in-flight Redis call is made at a time. However, it does NOT
// collapse downstream database fetches — on a cache miss all waiting goroutines
// receive the same ("", false, nil) result and will each individually query the
// database. Callers that need full cache-stampede prevention must wrap their
// fetch-and-set logic in their own singleflight.Group.
func (r *ResilientRedisCache) Get(ctx context.Context, key string) (string, bool, error) {
	// singleflight deduplicates concurrent Redis GETs for the same key.
	// Use context.WithoutCancel so that one caller's cancellation does not
	// abort the shared Redis GET and poison all other waiting goroutines.
	// Trace spans and baggage are preserved; only the cancel signal is stripped.
	// The Redis client's ReadTimeout (1 s, set at construction) bounds the call.
	detached := context.WithoutCancel(ctx)
	v, err, _ := r.sfGroup.Do(key, func() (any, error) {
		raw, cbErr := r.breaker.Execute(func() (any, error) {
			val, redisErr := r.client.Get(detached, key).Result()
			if errors.Is(redisErr, redis.Nil) {
				return getResult{found: false}, nil
			}
			if redisErr != nil {
				// Do not include the key in the error — it may contain user IDs or PII.
				return nil, fmt.Errorf("redis GET: %w", redisErr)
			}
			return getResult{value: val, found: true}, nil
		})

		if isCircuitOpen(cbErr) {
			// Circuit breaker is open — treat as a cache miss transparently.
			// Do NOT log here: OnStateChange already emits a single log line when
			// the breaker transitions to open. Logging on every call would flood
			// the log aggregator at high request rates.
			return getResult{found: false}, nil
		}
		if cbErr != nil {
			// Real Redis error — surface to caller so it can be logged/tracked.
			return getResult{}, cbErr
		}

		res, ok := raw.(getResult)
		if !ok {
			return getResult{}, fmt.Errorf("redis cache: unexpected result type from circuit breaker")
		}
		return res, nil
	})

	if err != nil {
		return "", false, err
	}
	res, ok := v.(getResult)
	if !ok {
		return "", false, fmt.Errorf("redis cache: unexpected singleflight result type")
	}
	return res.value, res.found, nil
}

// Set stores value under key with the given TTL.
// When the circuit breaker is open the write is silently skipped so callers
// are not impacted by Redis unavailability.
func (r *ResilientRedisCache) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	// Use context.WithoutCancel consistent with Get: a cancelled request context
	// should not be counted as a Redis failure by the circuit breaker.
	detached := context.WithoutCancel(ctx)
	_, cbErr := r.breaker.Execute(func() (any, error) {
		if err := r.client.Set(detached, key, value, ttl).Err(); err != nil {
			// Do not include the key in the error — it may contain user IDs or PII.
			return nil, fmt.Errorf("redis SET: %w", err)
		}
		return nil, nil
	})

	if isCircuitOpen(cbErr) {
		// Circuit breaker is open — skip write silently.
		// Do NOT log here: OnStateChange already emits a single log line on transition.
		return nil
	}
	return cbErr
}

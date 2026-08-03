package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
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
//
//	client := redis.NewClient(&redis.Options{..., PoolSize: 20})
//	cache := NewResilientRedisCacheWithClient(client)
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

func (r *ResilientRedisCache) IncrementWithTTL(ctx context.Context, key string, ttl time.Duration) (int64, error) {
	if ttl <= 0 {
		return 0, errors.New("redis counter ttl must be positive")
	}
	detached := context.WithoutCancel(ctx)
	ttlMilliseconds := ttl.Milliseconds()
	if ttlMilliseconds < 1 {
		ttlMilliseconds = 1
	}
	const incrementScript = `
		local count = redis.call('INCR', KEYS[1])
		if count == 1 then
			redis.call('PEXPIRE', KEYS[1], ARGV[1])
		end
		return count
	`
	value, cbErr := r.breaker.Execute(func() (any, error) {
		count, err := r.client.Eval(detached, incrementScript, []string{key}, ttlMilliseconds).Int64()
		if err != nil {
			return nil, fmt.Errorf("redis atomic increment: %w", err)
		}
		return count, nil
	})
	if cbErr != nil {
		return 0, cbErr
	}
	count, ok := value.(int64)
	if !ok || count < 1 {
		return 0, errors.New("redis counter returned an invalid value")
	}
	return count, nil
}

const reserveRollingWindowScript = `
	redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
	local used = redis.call('ZCARD', KEYS[1])
	local requested = #ARGV - 4
	if used + requested > tonumber(ARGV[4]) then
		local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
		if used > 0 then redis.call('PEXPIRE', KEYS[1], ARGV[3]) end
		return {0, used, oldest[2] or ''}
	end
	for index = 5, #ARGV do
		local added = redis.call('ZADD', KEYS[1], 'NX', ARGV[2], ARGV[index])
		if added ~= 1 then return redis.error_reply('duplicate rolling window member') end
	end
	used = redis.call('ZCARD', KEYS[1])
	redis.call('PEXPIRE', KEYS[1], ARGV[3])
	local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
	return {1, used, oldest[2] or ''}
`

const inspectRollingWindowScript = `
	redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
	local used = redis.call('ZCARD', KEYS[1])
	if used == 0 then
		redis.call('DEL', KEYS[1])
		return {1, 0, ''}
	end
	redis.call('PEXPIRE', KEYS[1], ARGV[2])
	local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
	return {1, used, oldest[2] or ''}
`

func (r *ResilientRedisCache) ReserveRollingWindow(ctx context.Context, key string, memberIDs []string, now time.Time, window time.Duration, limit int) (RollingWindowSnapshot, error) {
	if key == "" || len(memberIDs) == 0 || window <= 0 || limit < 1 {
		return RollingWindowSnapshot{}, errors.New("invalid rolling window reservation")
	}
	if err := validateRollingMemberIDs(memberIDs); err != nil {
		return RollingWindowSnapshot{}, err
	}
	args := make([]any, 0, 4+len(memberIDs))
	args = append(args, now.Add(-window).UnixMilli(), now.UnixMilli(), positiveMilliseconds(window), limit)
	for _, memberID := range memberIDs {
		args = append(args, memberID)
	}
	return r.evalRollingWindow(ctx, reserveRollingWindowScript, key, args...)
}

func (r *ResilientRedisCache) InspectRollingWindow(ctx context.Context, key string, now time.Time, window time.Duration) (RollingWindowSnapshot, error) {
	if key == "" || window <= 0 {
		return RollingWindowSnapshot{}, errors.New("invalid rolling window inspection")
	}
	return r.evalRollingWindow(ctx, inspectRollingWindowScript, key, now.Add(-window).UnixMilli(), positiveMilliseconds(window))
}

func (r *ResilientRedisCache) ReleaseRollingWindow(ctx context.Context, key string, memberIDs []string) error {
	if key == "" {
		return errors.New("rolling window key is required")
	}
	if len(memberIDs) == 0 {
		return nil
	}
	args := make([]any, len(memberIDs))
	for index, memberID := range memberIDs {
		args[index] = memberID
	}
	detached := context.WithoutCancel(ctx)
	_, err := r.breaker.Execute(func() (any, error) {
		if redisErr := r.client.ZRem(detached, key, args...).Err(); redisErr != nil {
			return nil, fmt.Errorf("redis rolling window release: %w", redisErr)
		}
		return nil, nil
	})
	return err
}

func (r *ResilientRedisCache) evalRollingWindow(ctx context.Context, script, key string, args ...any) (RollingWindowSnapshot, error) {
	detached := context.WithoutCancel(ctx)
	value, err := r.breaker.Execute(func() (any, error) {
		result, redisErr := r.client.Eval(detached, script, []string{key}, args...).Slice()
		if redisErr != nil {
			return nil, fmt.Errorf("redis rolling window: %w", redisErr)
		}
		return result, nil
	})
	if err != nil {
		return RollingWindowSnapshot{}, err
	}
	result, ok := value.([]interface{})
	if !ok || len(result) != 3 {
		return RollingWindowSnapshot{}, errors.New("redis rolling window returned an invalid result")
	}
	allowed, err := redisInteger(result[0])
	if err != nil {
		return RollingWindowSnapshot{}, err
	}
	used, err := redisInteger(result[1])
	if err != nil || used < 0 {
		return RollingWindowSnapshot{}, errors.New("redis rolling window returned an invalid count")
	}
	var oldestAt *time.Time
	if raw := fmt.Sprint(result[2]); raw != "" && raw != "<nil>" {
		milliseconds, parseErr := strconv.ParseFloat(raw, 64)
		if parseErr != nil {
			return RollingWindowSnapshot{}, errors.New("redis rolling window returned an invalid timestamp")
		}
		value := time.UnixMilli(int64(milliseconds)).UTC()
		oldestAt = &value
	}
	return RollingWindowSnapshot{Allowed: allowed == 1, Used: int(used), OldestAt: oldestAt}, nil
}

func redisInteger(value interface{}) (int64, error) {
	switch typed := value.(type) {
	case int64:
		return typed, nil
	case string:
		return strconv.ParseInt(typed, 10, 64)
	case []byte:
		return strconv.ParseInt(string(typed), 10, 64)
	default:
		return 0, errors.New("redis rolling window returned an invalid integer")
	}
}

func positiveMilliseconds(duration time.Duration) int64 {
	milliseconds := duration.Milliseconds()
	if milliseconds < 1 {
		return 1
	}
	return milliseconds
}

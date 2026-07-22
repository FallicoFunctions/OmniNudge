package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
)

// RedisRateLimiter implements distributed rate limiting using Redis
type RedisRateLimiter struct {
	cache      services.Cache
	limit      int           // Max requests per window
	window     time.Duration // Time window
	prefix     string        // Redis key prefix
	failClosed bool          // reject requests when the counter backend is unavailable
	mu         sync.Mutex    // compatibility lock for caches without atomic counters
}

// FailClosed makes a limiter reject requests when its shared counter backend
// is unavailable. Use this for endpoints that incur provider cost or create
// scarce resources; silently disabling their limit during a cache outage would
// turn an infrastructure incident into unbounded spend or abuse.
func (rl *RedisRateLimiter) FailClosed() *RedisRateLimiter {
	rl.failClosed = true
	return rl
}

// NewRedisRateLimiter creates a Redis-backed rate limiter
// limit: max requests per window
// window: time window (e.g., 1 minute)
// prefix: Redis key prefix (e.g., "rate:api", "rate:upload")
func NewRedisRateLimiter(cache services.Cache, limit int, window time.Duration, prefix string) *RedisRateLimiter {
	return &RedisRateLimiter{
		cache:  cache,
		limit:  limit,
		window: window,
		prefix: prefix,
	}
}

// checkLimit checks if the user has exceeded the rate limit
// Returns: allowed (bool), remaining (int), resetTime (time.Time), error
func (rl *RedisRateLimiter) checkLimit(ctx context.Context, key string) (bool, int, time.Time, error) {
	now := time.Now()
	resetTime := now.Add(rl.window)
	if counter, ok := rl.cache.(services.AtomicCounter); ok {
		count, err := counter.IncrementWithTTL(ctx, key, rl.window)
		if err != nil {
			return !rl.failClosed, rl.limit, resetTime, err
		}
		remaining := rl.limit - int(count)
		if remaining < 0 {
			remaining = 0
		}
		return count <= int64(rl.limit), remaining, resetTime, nil
	}

	// Custom caches may only implement the legacy interface. Serialize that
	// fallback locally; production Redis and memory caches are atomic above.
	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Get current count
	value, hit, err := rl.cache.Get(ctx, key)
	if err != nil {
		return !rl.failClosed, rl.limit, resetTime, err
	}

	var count int
	if hit {
		count, _ = strconv.Atoi(value)
	}

	// Check if limit exceeded
	if count >= rl.limit {
		remaining := 0
		return false, remaining, resetTime, nil
	}

	// Increment counter
	count++
	if err := rl.cache.Set(ctx, key, strconv.Itoa(count), rl.window); err != nil {
		return !rl.failClosed, rl.limit - count, resetTime, err
	}

	remaining := rl.limit - count
	return true, remaining, resetTime, nil
}

// Middleware returns a Gin middleware function for distributed rate limiting
func (rl *RedisRateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Use a per-user key when AuthRequired has supplied a valid ID. A missing
		// or malformed context value falls back to the anonymous IP bucket rather
		// than panicking or bypassing the limiter.
		key := fmt.Sprintf("%s:ip:%s", rl.prefix, c.ClientIP())
		if userID, exists := c.Get("user_id"); exists {
			if uid, ok := userID.(int); ok {
				key = fmt.Sprintf("%s:user:%d", rl.prefix, uid)
			}
		}
		allowed, remaining, resetTime, err := rl.checkLimit(c.Request.Context(), key)

		// Add rate limit headers (P0-007)
		c.Header("X-RateLimit-Limit", strconv.Itoa(rl.limit))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))
		c.Header("X-RateLimit-Reset", strconv.FormatInt(resetTime.Unix(), 10))

		if err != nil && rl.failClosed {
			c.Header("Retry-After", "5")
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Rate limiting is temporarily unavailable. Please try again later.",
				"code":  "RATE_LIMIT_UNAVAILABLE",
			})
			c.Abort()
			return
		}

		if !allowed {
			c.Header("Retry-After", strconv.Itoa(int(rl.window.Seconds())))
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":   "Rate limit exceeded. Please try again later.",
				"code":    "RATE_LIMIT_EXCEEDED",
				"limit":   rl.limit,
				"window":  rl.window.String(),
				"retryIn": int(rl.window.Seconds()),
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// AuthRateLimiter creates a distributed rate limiter for authentication
// 5 login attempts per 15 minutes per IP
func AuthRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 5, 15*time.Minute, "rate:auth").FailClosed()
}

// PasswordResetRateLimiter creates a distributed rate limiter for password resets
// 3 reset requests per hour per IP
func PasswordResetRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 3, time.Hour, "rate:password_reset").FailClosed()
}

// FriendRequestRateLimiterRedis limits relationship-spam across every backend
// instance. It fails closed because accepting unmetered requests during a cache
// outage would expose users to a burst of unsolicited requests.
func FriendRequestRateLimiterRedis(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 20, time.Hour, "rate:friend_requests").FailClosed()
}

// AIDesignRateLimiter creates a distributed rate limiter for AI design generation.
// 30 generations per hour per user.
func AIDesignRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 30, time.Hour, "rate:ai_design").FailClosed()
}

// ChatDesignRateLimiter creates a distributed rate limiter for AI design chat refinements.
// 60 refinements per hour per user, separate from the generation quota.
func ChatDesignRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 60, time.Hour, "rate:ai_design_chat").FailClosed()
}

// OmniChatRateLimiter creates a distributed rate limiter for OmniChat bot
// messages. The upstream OpenRouter free tier is a shared, low daily quota
// across the whole app, so this is deliberately tight per user.
// 20 messages per hour per user.
func OmniChatRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 20, time.Hour, "rate:omnichat").FailClosed()
}

// OmniChatMediaGenerationRateLimiter isolates costly image/video jobs from
// ordinary character messages so one activity cannot unexpectedly lock out the
// other while still enforcing a distributed provider-cost boundary.
func OmniChatMediaGenerationRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 10, time.Hour, "rate:omnichat_media").FailClosed()
}

func OmniChatSocialRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 60, time.Hour, "rate:omnichat_social").FailClosed()
}

func OmniChatVoiceRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 60, time.Hour, "rate:omnichat_voice").FailClosed()
}

func OmniChatCallRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 10, time.Hour, "rate:omnichat_call").FailClosed()
}

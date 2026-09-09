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

// OmniChatRateLimiter is a distributed burst boundary for provider-backed
// replies. It complements (rather than replaces) the rolling allowance system:
// a user may have a 24-hour allowance, but cannot turn it into concurrent
// provider spend by firing many requests at once. Twelve requests per minute
// permits normal rapid back-and-forth and regeneration without allowing a
// browser retry loop to exhaust the provider or a paid account to go unlimited.
func OmniChatRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 12, time.Minute, "rate:omnichat_messages").FailClosed()
}

// OmniChatMediaGenerationRateLimiter isolates costly image/video jobs from
// ordinary character messages. Each authenticated user gets one generation
// request per rolling minute. The versioned key intentionally leaves behind
// stale hourly counters from the previous policy without letting them block a
// fresh request after the policy change.
func OmniChatMediaGenerationRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 1, time.Minute, "rate:omnichat_media_v2").FailClosed()
}

func OmniChatSocialRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 60, time.Hour, "rate:omnichat_social").FailClosed()
}

func OmniChatVoiceRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 60, time.Hour, "rate:omnichat_voice").FailClosed()
}

// OmniChatCallRateLimiter bounds how fast calls can be started, not how many
// somebody may have.
//
// Cost is handled by billing: a call charges credits when it starts and then
// per minute. Ten an hour was policing a price that is already policed, and it
// turned an ordinary evening of use into "the call could not be connected"
// with no way to tell that from a network fault. Five a minute stops a runaway
// loop and nothing else.
func OmniChatCallRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 5, time.Minute, "rate:omnichat_call").FailClosed()
}

// OmniChatCallTranscriptionRateLimiter bounds transcribing what somebody said,
// which happens once per sentence rather than once per call.
//
// Its own budget, and its own key. Sharing the call limiter would give a
// hands-free conversation ten sentences an hour and then spend the rest of the
// allowance that exists to let somebody start a call at all -- so talking for
// a minute would lock the phone for the next hour.
//
// Two hundred is a long conversation and still bounds the cost: each one is a
// model request, and a runaway recorder must not be able to spend without
// limit.
func OmniChatCallTranscriptionRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 200, time.Hour, "rate:omnichat_call_transcription").FailClosed()
}

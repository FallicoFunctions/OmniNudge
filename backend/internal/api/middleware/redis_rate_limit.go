package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
)

// RedisRateLimiter implements distributed rate limiting using Redis
type RedisRateLimiter struct {
	cache  services.Cache
	limit  int           // Max requests per window
	window time.Duration // Time window
	prefix string        // Redis key prefix
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

	// Get current count
	value, hit, err := rl.cache.Get(ctx, key)
	if err != nil {
		// On Redis error, allow request (fail open)
		return true, rl.limit, resetTime, nil
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
		// On Redis error, allow request (fail open)
		return true, rl.limit - count, resetTime, nil
	}

	remaining := rl.limit - count
	return true, remaining, resetTime, nil
}

// Middleware returns a Gin middleware function for distributed rate limiting
func (rl *RedisRateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get user ID from context (set by AuthRequired middleware)
		userID, exists := c.Get("user_id")
		if !exists {
			// If no user ID, rate limit by IP for anonymous requests
			key := fmt.Sprintf("%s:ip:%s", rl.prefix, c.ClientIP())
			allowed, remaining, resetTime, _ := rl.checkLimit(c.Request.Context(), key)

			// Add rate limit headers
			c.Header("X-RateLimit-Limit", strconv.Itoa(rl.limit))
			c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))
			c.Header("X-RateLimit-Reset", strconv.FormatInt(resetTime.Unix(), 10))

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
			return
		}

		// Rate limit by user ID
		uid := userID.(int)
		key := fmt.Sprintf("%s:user:%d", rl.prefix, uid)
		allowed, remaining, resetTime, _ := rl.checkLimit(c.Request.Context(), key)

		// Add rate limit headers (P0-007)
		c.Header("X-RateLimit-Limit", strconv.Itoa(rl.limit))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))
		c.Header("X-RateLimit-Reset", strconv.FormatInt(resetTime.Unix(), 10))

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

// BypassRateLimitFor creates a middleware that bypasses rate limiting for specific users
// Useful for admin accounts or testing
func BypassRateLimitFor(whitelistedUserIDs []int) gin.HandlerFunc {
	whitelist := make(map[int]bool)
	for _, id := range whitelistedUserIDs {
		whitelist[id] = true
	}

	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if exists {
			uid := userID.(int)
			if whitelist[uid] {
				// Skip to next handler without rate limiting
				c.Next()
				return
			}
		}
		// Continue to rate limiter
		c.Next()
	}
}

// GlobalAPIRateLimiter creates a distributed rate limiter for all API endpoints
// 100 requests per minute per user
func GlobalAPIRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 100, time.Minute, "rate:api")
}

// UploadRateLimiterRedis creates a distributed rate limiter for uploads
// 10 uploads per minute per user
func UploadRateLimiterRedis(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 10, time.Minute, "rate:upload")
}

// PostCreationRateLimiter creates a distributed rate limiter for post creation
// 20 posts per hour per user
func PostCreationRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 20, time.Hour, "rate:post")
}

// CommentCreationRateLimiter creates a distributed rate limiter for comment creation
// 60 comments per hour per user
func CommentCreationRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 60, time.Hour, "rate:comment")
}

// MessageSendRateLimiter creates a distributed rate limiter for message sending
// 100 messages per minute per user
func MessageSendRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 100, time.Minute, "rate:message")
}

// AuthRateLimiter creates a distributed rate limiter for authentication
// 5 login attempts per 15 minutes per IP
func AuthRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 5, 15*time.Minute, "rate:auth")
}

// PasswordResetRateLimiter creates a distributed rate limiter for password resets
// 3 reset requests per hour per IP
func PasswordResetRateLimiter(cache services.Cache) *RedisRateLimiter {
	return NewRedisRateLimiter(cache, 3, time.Hour, "rate:password_reset")
}

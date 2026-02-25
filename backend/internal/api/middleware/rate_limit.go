package middleware

import (
	"fmt"
	"log"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// limiterEntry pairs a rate limiter with the last time it was accessed,
// so the cleanup goroutine can evict stale entries and prevent unbounded growth.
type limiterEntry struct {
	limiter    *rate.Limiter
	lastAccess time.Time
}

// RateLimiter manages per-user token-bucket rate limiters.
type RateLimiter struct {
	limiters map[int]*limiterEntry
	mu       sync.RWMutex
	limit    rate.Limit
	burst    int // Maximum tokens available in the bucket
}

// NewRateLimiter creates a new rate limiter and starts a background goroutine
// that evicts limiters not accessed in the last 24 hours.
// limit: requests per second; burst: maximum burst size.
func NewRateLimiter(limit rate.Limit, burst int) *RateLimiter {
	rl := &RateLimiter{
		limiters: make(map[int]*limiterEntry),
		limit:    limit,
		burst:    burst,
	}
	go rl.evictStale()
	return rl
}

// evictStale removes limiters that have not been accessed in 24 hours.
// This prevents the limiters map from growing indefinitely.
func (rl *RateLimiter) evictStale() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-24 * time.Hour)
		rl.mu.Lock()
		for id, entry := range rl.limiters {
			if entry.lastAccess.Before(cutoff) {
				delete(rl.limiters, id)
			}
		}
		rl.mu.Unlock()
	}
}

// getLimiter returns the rate limiter for a specific user, creating one if it doesn't exist.
func (rl *RateLimiter) getLimiter(userID int) *rate.Limiter {
	rl.mu.RLock()
	entry, exists := rl.limiters[userID]
	rl.mu.RUnlock()

	if exists {
		// Update lastAccess under a write lock to avoid a data race.
		rl.mu.Lock()
		rl.limiters[userID].lastAccess = time.Now()
		rl.mu.Unlock()
		return entry.limiter
	}

	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Double-check after acquiring write lock.
	if existing, exists := rl.limiters[userID]; exists {
		existing.lastAccess = time.Now()
		return existing.limiter
	}

	e := &limiterEntry{
		limiter:    rate.NewLimiter(rl.limit, rl.burst),
		lastAccess: time.Now(),
	}
	rl.limiters[userID] = e
	return e.limiter
}

// maxThrottleWait is the maximum reservation delay before a request is blocked
// rather than throttled.
const maxThrottleWait = 500 * time.Millisecond

// Middleware returns a Gin middleware function for graduated rate limiting.
//
// Three tiers:
//   - Warn  (< 20% tokens remaining):  request proceeds normally, adds
//     X-RateLimit-Warning header.
//   - Throttle (0 tokens, reserve delay ≤ 500 ms): request proceeds after a
//     100 ms artificial delay, adds X-RateLimit-Throttled header.
//   - Block (reserve delay > 500 ms): returns HTTP 429 with Retry-After and
//     X-RateLimit-Reset headers.
//
// Every response receives X-RateLimit-Limit and X-RateLimit-Remaining headers.
func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get user ID from context (set by AuthRequired middleware).
		rawID, exists := c.Get("user_id")
		if !exists {
			// No user ID means a public endpoint — skip rate limiting.
			c.Next()
			return
		}
		userID, ok := rawID.(int)
		if !ok {
			// user_id is present but wrong type — log and skip rather than panic.
			log.Printf("[rate_limit] unexpected user_id type %T; skipping rate limit", rawID)
			c.Next()
			return
		}

		limiter := rl.getLimiter(userID)

		// Snapshot approximate remaining tokens before consuming one.
		tokens := limiter.Tokens()
		remaining := int(math.Max(0, tokens-1))

		// Always set informational headers.
		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", rl.burst))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))

		// Try to reserve one token to determine the wait duration without
		// immediately blocking the goroutine.
		r := limiter.Reserve()
		delay := r.Delay()

		if delay > maxThrottleWait {
			// Block tier — cancel the reservation so the token is returned.
			r.Cancel()
			retryAfter := int(math.Max(1, math.Ceil(delay.Seconds())))
			resetAt := time.Now().Add(delay).Unix()
			c.Header("Retry-After", fmt.Sprintf("%d", retryAfter))
			c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", resetAt))
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please try again later.",
			})
			c.Abort()
			return
		}

		if delay > 0 {
			// Throttle tier — sleep 100 ms regardless of exact delay.
			c.Header("X-RateLimit-Throttled", "true")
			time.Sleep(100 * time.Millisecond)
		} else if tokens < float64(rl.burst)*0.20 {
			// Warn tier — token budget nearly exhausted.
			c.Header("X-RateLimit-Warning", "approaching limit")
		}

		c.Next()
	}
}

// UploadRateLimiter creates a rate limiter specifically for media uploads
// Allows 10 uploads per minute (10 requests / 60 seconds = ~0.1667 requests/second)
func UploadRateLimiter() *RateLimiter {
	// 10 uploads per minute with burst of 3.
	return NewRateLimiter(rate.Limit(10.0/60.0), 3)
}

// ThemeCreationRateLimiter creates a rate limiter for theme creation/updates
// Allows 10 theme saves per hour (10 requests / 3600 seconds = ~0.00278 requests/second)
func ThemeCreationRateLimiter() *RateLimiter {
	// 10 theme saves per hour with burst of 2
	return NewRateLimiter(rate.Limit(10.0/3600.0), 2)
}

// ThemePreviewRateLimiter creates a rate limiter for theme previews
// Allows 50 previews per hour (50 requests / 3600 seconds = ~0.0139 requests/second)
// This is more permissive since previews are read-only operations
func ThemePreviewRateLimiter() *RateLimiter {
	// 50 previews per hour with burst of 10
	return NewRateLimiter(rate.Limit(50.0/3600.0), 10)
}

// GeneralAPIRateLimiter creates a general rate limiter for standard API operations
// Allows 100 requests per minute (100 requests / 60 seconds = ~1.67 requests/second)
func GeneralAPIRateLimiter() *RateLimiter {
	// 100 requests per minute with burst of 20
	return NewRateLimiter(rate.Limit(100.0/60.0), 20)
}

// ReactionRateLimiter creates a rate limiter for message reaction endpoints.
// Allows 10 reactions per 10 seconds (1 reaction/second steady-state) with a
// burst of 10 so a user can quickly react to multiple messages without hitting
// the limit immediately.
func ReactionRateLimiter() *RateLimiter {
	return NewRateLimiter(rate.Limit(1.0), 10)
}

package middleware

import (
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// RateLimiter manages rate limiters for users
type RateLimiter struct {
	limiters map[int]*rate.Limiter
	mu       sync.RWMutex
	limit    rate.Limit
	burst    int
}

// NewRateLimiter creates a new rate limiter
// limit: requests per second
// burst: maximum burst size
func NewRateLimiter(limit rate.Limit, burst int) *RateLimiter {
	return &RateLimiter{
		limiters: make(map[int]*rate.Limiter),
		limit:    limit,
		burst:    burst,
	}
}

// getLimiter returns the rate limiter for a specific user, creating one if it doesn't exist
func (rl *RateLimiter) getLimiter(userID int) *rate.Limiter {
	rl.mu.RLock()
	limiter, exists := rl.limiters[userID]
	rl.mu.RUnlock()

	if exists {
		return limiter
	}

	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Double-check after acquiring write lock
	if limiter, exists := rl.limiters[userID]; exists {
		return limiter
	}

	// Create new limiter for this user
	limiter = rate.NewLimiter(rl.limit, rl.burst)
	rl.limiters[userID] = limiter

	return limiter
}

// Middleware returns a Gin middleware function for rate limiting
func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get user ID from context (set by AuthRequired middleware)
		userID, exists := c.Get("user_id")
		if !exists {
			// If no user ID, skip rate limiting (public endpoints)
			c.Next()
			return
		}

		limiter := rl.getLimiter(userID.(int))

		if !limiter.Allow() {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please try again later.",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// UploadRateLimiter creates a rate limiter specifically for media uploads
// Allows 10 uploads per minute (10 requests / 60 seconds = ~0.167 requests/second)
func UploadRateLimiter() *RateLimiter {
	// 10 uploads per minute with burst of 3 (allows small bursts)
	return NewRateLimiter(rate.Limit(10.0/60.0), 3)
}

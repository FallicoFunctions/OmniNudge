package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Simple in-memory rate limiter using token bucket algorithm
// For production, use Redis-based implementation

type tokenBucket struct {
	tokens        int
	maxTokens     int
	refillRate    int // tokens per minute
	lastRefill    time.Time
	mu            sync.Mutex
}

type RateLimiter struct {
	buckets map[string]*tokenBucket
	mu      sync.RWMutex
}

func NewRateLimiter() *RateLimiter {
	rl := &RateLimiter{
		buckets: make(map[string]*tokenBucket),
	}
	// Cleanup old buckets every 10 minutes
	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) getBucket(key string, maxTokens, refillRate int) *tokenBucket {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	bucket, exists := rl.buckets[key]
	if !exists {
		bucket = &tokenBucket{
			tokens:     maxTokens,
			maxTokens:  maxTokens,
			refillRate: refillRate,
			lastRefill: time.Now(),
		}
		rl.buckets[key] = bucket
	}

	return bucket
}

func (b *tokenBucket) tryConsume() bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Refill tokens based on time elapsed
	now := time.Now()
	elapsed := now.Sub(b.lastRefill)
	tokensToAdd := int(elapsed.Minutes()) * b.refillRate
	if tokensToAdd > 0 {
		b.tokens = min(b.tokens+tokensToAdd, b.maxTokens)
		b.lastRefill = now
	}

	// Try to consume a token
	if b.tokens > 0 {
		b.tokens--
		return true
	}

	return false
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for key, bucket := range rl.buckets {
			bucket.mu.Lock()
			if now.Sub(bucket.lastRefill) > 30*time.Minute {
				delete(rl.buckets, key)
			}
			bucket.mu.Unlock()
		}
		rl.mu.Unlock()
	}
}

// RateLimit creates a rate limiting middleware
// maxRequests: maximum requests allowed
// perMinutes: time window in minutes
func RateLimit(maxRequests, perMinutes int) gin.HandlerFunc {
	limiter := NewRateLimiter()
	refillRate := maxRequests / perMinutes

	return func(c *gin.Context) {
		// Use user ID if authenticated, otherwise use IP
		var key string
		if userID, exists := c.Get("user_id"); exists {
			key = "user:" + string(rune(userID.(int)))
		} else {
			key = "ip:" + c.ClientIP()
		}

		bucket := limiter.getBucket(key, maxRequests, refillRate)
		if !bucket.tryConsume() {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please try again later.",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

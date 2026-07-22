package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

type failingRateLimitCache struct{}

func (failingRateLimitCache) Get(context.Context, string) (string, bool, error) {
	return "", false, errors.New("counter unavailable")
}

func (failingRateLimitCache) Set(context.Context, string, string, time.Duration) error {
	return errors.New("counter unavailable")
}

func (failingRateLimitCache) IncrementWithTTL(context.Context, string, time.Duration) (int64, error) {
	return 0, errors.New("counter unavailable")
}

func TestRedisRateLimiterEnforcesLimitAtomicallyUnderConcurrency(t *testing.T) {
	cache := services.NewMemoryCache()
	t.Cleanup(cache.Stop)
	limiter := NewRedisRateLimiter(cache, 10, time.Minute, "rate:test")
	var allowed atomic.Int32
	var requests sync.WaitGroup
	start := make(chan struct{})
	for range 100 {
		requests.Add(1)
		go func() {
			defer requests.Done()
			<-start
			ok, _, _, err := limiter.checkLimit(context.Background(), "rate:test:user:1")
			require.NoError(t, err)
			if ok {
				allowed.Add(1)
			}
		}()
	}
	close(start)
	requests.Wait()

	require.Equal(t, int32(10), allowed.Load())
}

func TestRedisRateLimiterPreservesDefaultFailOpenPolicy(t *testing.T) {
	limiter := NewRedisRateLimiter(failingRateLimitCache{}, 10, time.Minute, "rate:test")
	allowed, _, _, err := limiter.checkLimit(context.Background(), "rate:test:user:1")
	require.Error(t, err)
	require.True(t, allowed)
}

func TestOmniChatRateLimiterFailsClosedWhenCounterUnavailable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", 42)
		c.Next()
	})
	router.POST("/omnichat", OmniChatRateLimiter(failingRateLimitCache{}).Middleware(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodPost, "/omnichat", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusServiceUnavailable, response.Code)
	require.JSONEq(t, `{"error":"Rate limiting is temporarily unavailable. Please try again later.","code":"RATE_LIMIT_UNAVAILABLE"}`, response.Body.String())
	require.Equal(t, "5", response.Header().Get("Retry-After"))
}

func TestFriendRequestRateLimiterFailsClosedWhenCounterUnavailable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", 42)
		c.Next()
	})
	router.POST("/friend-requests", FriendRequestRateLimiterRedis(failingRateLimitCache{}).Middleware(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/friend-requests", nil))

	require.Equal(t, http.StatusServiceUnavailable, response.Code)
}

func TestSecuritySensitiveRateLimitersFailClosed(t *testing.T) {
	tests := map[string]*RedisRateLimiter{
		"authentication": AuthRateLimiter(failingRateLimitCache{}),
		"password reset": PasswordResetRateLimiter(failingRateLimitCache{}),
		"AI generation":  AIDesignRateLimiter(failingRateLimitCache{}),
		"AI refinement":  ChatDesignRateLimiter(failingRateLimitCache{}),
	}

	for name, limiter := range tests {
		t.Run(name, func(t *testing.T) {
			allowed, _, _, err := limiter.checkLimit(context.Background(), "rate:test:ip:192.0.2.1")
			require.Error(t, err)
			require.False(t, allowed)
		})
	}
}

func TestIPRateLimitIgnoresSpoofedForwardedForWithoutTrustedProxy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cache := services.NewMemoryCache()
	t.Cleanup(cache.Stop)
	limiter := NewRedisRateLimiter(cache, 1, time.Minute, "rate:test")
	router := gin.New()
	require.NoError(t, router.SetTrustedProxies(nil))
	router.POST("/preview", limiter.Middleware(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	for index, spoofedIP := range []string{"198.51.100.10", "203.0.113.22"} {
		request := httptest.NewRequest(http.MethodPost, "/preview", nil)
		request.RemoteAddr = "192.0.2.50:12345"
		request.Header.Set("X-Forwarded-For", spoofedIP)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if index == 0 {
			require.Equal(t, http.StatusNoContent, response.Code)
		} else {
			require.Equal(t, http.StatusTooManyRequests, response.Code)
		}
	}
}

func TestRedisRateLimiterMalformedUserContextFallsBackToIP(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cache := services.NewMemoryCache()
	t.Cleanup(cache.Stop)
	limiter := NewRedisRateLimiter(cache, 1, time.Minute, "rate:test")
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", "not-an-int")
		c.Next()
	})
	router.POST("/", limiter.Middleware(), func(c *gin.Context) { c.Status(http.StatusNoContent) })

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/", nil))
	require.Equal(t, http.StatusNoContent, response.Code)
}

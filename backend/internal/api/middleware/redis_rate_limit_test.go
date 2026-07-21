package middleware

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

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

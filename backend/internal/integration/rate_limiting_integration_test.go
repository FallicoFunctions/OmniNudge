//go:build integration

package integration

import (
	"bytes"
	"fmt"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var rateLimitTestCounter int64

func uniqueRLUsername(base string) string {
	id := atomic.AddInt64(&rateLimitTestCounter, 1)
	return fmt.Sprintf("%s_rl_%d_%d", base, time.Now().UnixNano(), id)
}

// loginPayload builds a JSON login body.
func loginPayload(username, password string) []byte {
	return []byte(fmt.Sprintf(`{"username":%q,"password":%q}`, username, password))
}

// TestRateLimitAuthEndpoints verifies that POST /auth/login returns 429 after
// exceeding the per-IP rate limit window (6+ rapid attempts).
func TestRateLimitAuthEndpoints(t *testing.T) {
	deps := newRateLimitedTestDeps(t)
	defer deps.DB.Close()

	// Create a real user so early requests may legitimately succeed.
	username := uniqueRLUsername("rlu")
	createUser(t, deps.UserRepo, username, "user")

	var firstRateLimited int
	for i := 1; i <= 10; i++ {
		body := loginPayload(username, "wrongpassword")
		req, err := http.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		// Simulate same IP via X-Forwarded-For so the middleware buckets them together.
		req.Header.Set("X-Forwarded-For", "203.0.113.42")

		w := doRequest(t, deps.Router, req)

		if w.Code == http.StatusTooManyRequests {
			firstRateLimited = i
			t.Logf("rate limit hit on attempt %d", i)
			break
		}
		// Acceptable status codes before the limit: 401 (bad creds) or 400 (validation).
		assert.True(t,
			w.Code == http.StatusUnauthorized || w.Code == http.StatusBadRequest,
			"expected 401 or 400 before rate limit, got %d on attempt %d", w.Code, i,
		)
	}

	// AuthRateLimiter allows 5 attempts per 15 minutes per IP.
	assert.Equal(t, 6, firstRateLimited, "the sixth login attempt should be the first refused")
}

// TestRateLimitHeaders checks that rate-limit-related headers are present on
// login responses (whether or not the server is currently rate-limiting).
func TestRateLimitHeaders(t *testing.T) {
	deps := newRateLimitedTestDeps(t)
	defer deps.DB.Close()

	username := uniqueRLUsername("rlh")
	createUser(t, deps.UserRepo, username, "user")

	body := loginPayload(username, "wrongpassword")
	req, err := http.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", "203.0.113.43")

	w := doRequest(t, deps.Router, req)

	// The response should be either 401 (bad creds) or 429 (rate limited).
	assert.True(t,
		w.Code == http.StatusUnauthorized ||
			w.Code == http.StatusBadRequest ||
			w.Code == http.StatusTooManyRequests,
		"unexpected status %d", w.Code,
	)

	assert.Equal(t, "5", w.Header().Get("X-RateLimit-Limit"))
	assert.Equal(t, "4", w.Header().Get("X-RateLimit-Remaining"))
	assert.NotEmpty(t, w.Header().Get("X-RateLimit-Reset"))

	// If the server returns 429 it MUST include Retry-After.
	if w.Code == http.StatusTooManyRequests {
		assert.NotEmpty(t, w.Header().Get("Retry-After"),
			"429 response must include Retry-After header")
	}
}

// TestRateLimitResetAfterWindow verifies that after being rate-limited, the
// header reports a non-zero reset time in the future (or the server recovers
// after a short wait). This test does not sleep for a full window — it just
// inspects the reset header value.
func TestRateLimitResetAfterWindow(t *testing.T) {
	deps := newRateLimitedTestDeps(t)
	defer deps.DB.Close()

	username := uniqueRLUsername("rlr")
	createUser(t, deps.UserRepo, username, "user")

	// Fire enough requests to potentially hit the limit.
	const attempts = 12
	ip := "203.0.113.44"
	var lastCode int
	var resetHeader string

	for i := 0; i < attempts; i++ {
		body := loginPayload(username, "wrongpassword")
		req, err := http.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Forwarded-For", ip)

		w := doRequest(t, deps.Router, req)
		lastCode = w.Code

		if w.Code == http.StatusTooManyRequests {
			resetHeader = w.Header().Get("X-RateLimit-Reset")
			if resetHeader == "" {
				resetHeader = w.Header().Get("X-Ratelimit-Reset")
			}
			retryAfter := w.Header().Get("Retry-After")
			t.Logf("rate limited: X-RateLimit-Reset=%q Retry-After=%q", resetHeader, retryAfter)
			break
		}
	}

	require.Equal(t, http.StatusTooManyRequests, lastCode, "12 rapid logins should pass the limit of 5")

	// Reset value should be a Unix timestamp or seconds-delta > 0.
	assert.NotEmpty(t, resetHeader,
		"expected X-RateLimit-Reset header when 429 is returned")
}

// TestRateLimitDifferentIPsIndependent verifies that rate limit counters are
// scoped per-IP: two distinct IPs should each get their own quota.
// TestRateLimitModMailCreation: starting a mod mail thread sends a message, so
// it shares the 60-a-minute send limit. The limiter runs before the handler, so
// requests the handler would refuse still count against it.
func TestRateLimitModMailCreation(t *testing.T) {
	deps := newRateLimitedTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, uniqueRLUsername("rlmm"), "user")
	token, err := deps.AuthService.GenerateJWT(user.ID, user.Username, user.Role)
	require.NoError(t, err)

	firstRefused := 0
	for i := 1; i <= 61; i++ {
		req, err := http.NewRequest(http.MethodPost, "/api/v1/mod-mail", bytes.NewReader([]byte(`{}`)))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		if doRequest(t, deps.Router, req).Code == http.StatusTooManyRequests {
			firstRefused = i
			break
		}
	}
	assert.Equal(t, 61, firstRefused, "the 61st mod mail request should be the first refused")
}

func TestRateLimitDifferentIPsIndependent(t *testing.T) {
	deps := newRateLimitedTestDeps(t)
	defer deps.DB.Close()

	username := uniqueRLUsername("rlip")
	createUser(t, deps.UserRepo, username, "user")

	login := func(ip string) int {
		body := loginPayload(username, "wrongpassword")
		req, err := http.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		// The client's own address: gin trusts X-Forwarded-For only from a
		// proxy it knows, and a request with no RemoteAddr has none.
		req.RemoteAddr = ip + ":40000"
		return doRequest(t, deps.Router, req).Code
	}

	for i := 0; i < 5; i++ {
		login("203.0.113.50")
	}
	require.Equal(t, http.StatusTooManyRequests, login("203.0.113.50"), "the first IP should be over its limit")
	assert.NotEqual(t, http.StatusTooManyRequests, login("203.0.113.51"), "a second IP keeps its own quota")
}

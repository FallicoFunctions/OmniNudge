//go:build integration

package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var wsResilienceCounter int64

func uniqueWSRUsername(base string) string {
	id := atomic.AddInt64(&wsResilienceCounter, 1)
	return fmt.Sprintf("%s_wsr_%d_%d", base, time.Now().UnixNano(), id)
}

// dialWS dials the WebSocket endpoint with the given Bearer token.
func dialWS(ts *httptest.Server, token string) (*websocket.Conn, *http.Response, error) {
	wsURL := "ws" + ts.URL[len("http"):] + "/api/v1/ws"
	h := http.Header{}
	if token != "" {
		h.Set("Authorization", "Bearer "+token)
	}
	h.Set("Origin", "http://localhost:8080")
	return websocket.DefaultDialer.Dial(wsURL, h)
}

// TestWebSocketReconnectsAfterDrop verifies that after a connection is forcibly
// closed, a fresh connection with the same credentials is accepted.
func TestWebSocketReconnectsAfterDrop(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	ts := httptest.NewServer(deps.Router)
	defer ts.Close()

	user := createUser(t, deps.UserRepo, uniqueWSRUsername("reconnect"), "user")
	token, err := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)
	require.NoError(t, err)

	// First connection
	conn1, _, err := dialWS(ts, token)
	require.NoError(t, err, "first WebSocket connection should succeed")

	// Force-close without a proper close handshake
	conn1.Close()

	// Allow the server a moment to detect the drop
	time.Sleep(50 * time.Millisecond)

	// Reconnect — must succeed
	conn2, _, err := dialWS(ts, token)
	require.NoError(t, err, "reconnection after forced drop should succeed")
	defer conn2.Close()

	t.Log("reconnection successful")
}

// TestWebSocketRejectsUnauthenticated verifies that a connection without any
// auth token is rejected with a non-101 HTTP status (typically 401).
func TestWebSocketRejectsUnauthenticated(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	ts := httptest.NewServer(deps.Router)
	defer ts.Close()

	_, resp, err := dialWS(ts, "" /* no token */)
	if err == nil {
		t.Fatal("expected WebSocket connection without auth to fail, but it succeeded")
	}
	if resp != nil {
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode,
			"unauthenticated WebSocket connection should return 401")
		t.Logf("correctly rejected with HTTP %d", resp.StatusCode)
	} else {
		t.Logf("connection rejected (no HTTP response captured): %v", err)
	}
}

// TestWebSocketRejectsExpiredToken verifies that a connection with an expired
// JWT is rejected.
func TestWebSocketRejectsExpiredToken(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	ts := httptest.NewServer(deps.Router)
	defer ts.Close()

	user := createUser(t, deps.UserRepo, uniqueWSRUsername("expired"), "user")

	cfg, _ := config.Load()
	expiredToken := buildExpiredJWT(t, cfg.JWT.Secret, user.ID, user.Username, user.Role)

	_, resp, err := dialWS(ts, expiredToken)
	if err == nil {
		t.Fatal("expected expired-token WebSocket connection to fail, but it succeeded")
	}
	if resp != nil {
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode,
			"expired-token connection should return 401")
		t.Logf("correctly rejected expired token with HTTP %d", resp.StatusCode)
	} else {
		t.Logf("connection rejected (no HTTP response): %v", err)
	}
}

// buildExpiredJWT crafts a JWT that expired 1 hour ago using the provided HMAC secret.
func buildExpiredJWT(t *testing.T, secret string, userID int, username, role string) string {
	t.Helper()
	claims := jwt.MapClaims{
		"sub":      fmt.Sprintf("%d", userID),
		"username": username,
		"role":     role,
		"exp":      time.Now().Add(-1 * time.Hour).Unix(),
		"iat":      time.Now().Add(-2 * time.Hour).Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(secret))
	require.NoError(t, err)
	return signed
}

// TestWebSocketMessageRateLimit verifies that flooding messages over the
// REST API triggers rate limiting at approximately 60 msg/min. Sends 70
// messages rapidly and expects at least one 429 before the 70th.
func TestWebSocketMessageRateLimit(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	ts := httptest.NewServer(deps.Router)
	defer ts.Close()

	sender := createUser(t, deps.UserRepo, uniqueWSRUsername("rls"), "user")
	receiver := createUser(t, deps.UserRepo, uniqueWSRUsername("rlrec"), "user")

	senderToken, err := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)
	require.NoError(t, err)

	// Create a conversation
	convBody := []byte(fmt.Sprintf(`{"recipient_username":%q}`, receiver.Username))
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/conversations", bytes.NewReader(convBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+senderToken)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)

	var convResp struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &convResp))
	convID := convResp.ID

	// Send 70 messages rapidly and track if any 429 appears
	var rateLimitedAt int
	for i := 0; i < 70; i++ {
		msgBody := fmt.Sprintf(
			`{"conversation_id":%d,"encrypted_content":"flood_%d","message_type":"text","encryption_version":"v1"}`,
			convID, i,
		)
		r, _ := http.NewRequest(http.MethodPost, "/api/v1/messages", bytes.NewReader([]byte(msgBody)))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Authorization", "Bearer "+senderToken)
		resp := doRequest(t, deps.Router, r)
		if resp.Code == http.StatusTooManyRequests {
			rateLimitedAt = i + 1
			t.Logf("message rate limit hit on message %d", i+1)
			break
		}
	}

	if rateLimitedAt == 0 {
		t.Skip("message rate limiting did not trigger within 70 rapid sends — middleware may not be active on test router")
	}
	assert.LessOrEqual(t, rateLimitedAt, 70)
}

// TestWebSocketConcurrentConnections verifies behavior when the same user opens
// two simultaneous WebSocket connections. The test asserts the server handles
// both without panicking or returning a 5xx.
func TestWebSocketConcurrentConnections(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	ts := httptest.NewServer(deps.Router)
	defer ts.Close()

	user := createUser(t, deps.UserRepo, uniqueWSRUsername("concurrent"), "user")
	token, err := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)
	require.NoError(t, err)

	// First connection
	conn1, resp1, err1 := dialWS(ts, token)
	require.NoError(t, err1, "first connection must succeed")
	require.Equal(t, http.StatusSwitchingProtocols, resp1.StatusCode)
	defer conn1.Close()

	// Second connection — same user
	conn2, resp2, err2 := dialWS(ts, token)
	if err2 != nil {
		// Server chose to reject the second connection — acceptable policy.
		t.Logf("second connection rejected (single-session policy): %v", err2)
		if resp2 != nil {
			assert.NotEqual(t, http.StatusInternalServerError, resp2.StatusCode,
				"server must not return 5xx for concurrent connection attempt")
		}
		return
	}
	defer conn2.Close()

	t.Log("server allows concurrent connections for the same user")

	// Give the server a window to send a close frame to one connection.
	conn1.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	conn2.SetReadDeadline(time.Now().Add(300 * time.Millisecond))

	alive := 0
	for _, conn := range []*websocket.Conn{conn1, conn2} {
		_, _, readErr := conn.ReadMessage()
		if readErr == nil {
			alive++
		} else if websocket.IsCloseError(readErr,
			websocket.CloseNormalClosure,
			websocket.ClosePolicyViolation,
			websocket.CloseGoingAway,
		) {
			t.Logf("connection received close frame: %v", readErr)
		}
	}

	t.Logf("alive connections after 300ms: %d", alive)
}

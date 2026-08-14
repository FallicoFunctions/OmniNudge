package server

import (
	"context"
	"errors"
	"net/http/httptest"
	"runtime"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

// The world token is validated once, at the upgrade, and never again. These
// tests pin the consequence: a session ends when the token that admitted it
// does, so a credential worth five minutes cannot buy an afternoon.
//
// Delete the expiry timer from ServeHTTP and the first of these fails -- the
// connection stays open and the player stays in the world -- while the other
// two still pass, which is what tells you the first one is the load-bearing
// assertion rather than an accident of timing.

func TestWSHandler_EndsSessionWhenItsTokenExpires(t *testing.T) {
	worldState, testServer, authService := newExpiryTestServer(t)

	token := newWorldSessionTokenWithTTL(t, authService, "guest-expiring", "Guest-Expiring", shortSessionTTL)
	conn, _, err := websocket.DefaultDialer.Dial(
		buildWorldWSURL(testServer.URL, token, ""),
		worldDialHeader("https://play.omninudge.com"),
	)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	var joinSnapshot map[string]any
	require.NoError(t, conn.ReadJSON(&joinSnapshot))
	require.Equal(t, "world_snapshot", joinSnapshot["type"])
	require.NotNil(t, worldState.Player("guest-expiring"), "the player is in the world while the token is live")

	// Read until the read fails. The server closes the socket at exp, so this
	// returns an error rather than another snapshot; the deadline bounds the
	// wait so a regression fails the test instead of hanging it.
	_ = conn.SetReadDeadline(time.Now().Add(shortSessionTTL + 10*time.Second))
	for {
		var frame map[string]any
		if err := conn.ReadJSON(&frame); err != nil {
			require.False(t, isTimeout(err), "the session outlived its token: %v", err)
			break
		}
	}

	// Cleanup runs in the read loop's defer, so it lands just after the close.
	require.Eventually(t, func() bool {
		return worldState.Player("guest-expiring") == nil
	}, 5*time.Second, 20*time.Millisecond, "an expired session must leave the world, not just the socket")
}

func TestWSHandler_KeepsSessionWhoseTokenIsStillValid(t *testing.T) {
	worldState, testServer, authService := newExpiryTestServer(t)

	// The ordinary five-minute token: nothing about this connection should end
	// on its own within the life of a test.
	token := newGuestWorldSessionToken(t, authService, "guest-live", "Guest-Live", nil)
	conn, _, err := websocket.DefaultDialer.Dial(
		buildWorldWSURL(testServer.URL, token, ""),
		worldDialHeader("https://play.omninudge.com"),
	)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	var joinSnapshot map[string]any
	require.NoError(t, conn.ReadJSON(&joinSnapshot))
	require.Equal(t, "world_snapshot", joinSnapshot["type"])

	// Well past the point at which an expiring session would have been cut.
	time.Sleep(shortSessionTTL + 500*time.Millisecond)

	require.NoError(t, conn.WriteJSON(map[string]any{
		"type":   "move",
		"moveTo": map[string]float64{"x": 4, "y": 0, "z": 4},
	}))

	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	var afterMove map[string]any
	require.NoError(t, conn.ReadJSON(&afterMove), "a session with a valid token must still be connected")
	require.Equal(t, "world_snapshot", afterMove["type"])
	require.NotNil(t, worldState.Player("guest-live"))
}

func TestWSHandler_LeavesNothingRunningWhenTheClientDisconnectsFirst(t *testing.T) {
	worldState, testServer, authService := newExpiryTestServer(t)

	baseline := runtime.NumGoroutine()

	// Each of these carries a live expiry that never fires, because the client
	// leaves first. The timer has to be stopped on that path too.
	for i := 0; i < 20; i++ {
		token := newGuestWorldSessionToken(t, authService, "guest-transient", "Guest-Transient", nil)
		conn, _, err := websocket.DefaultDialer.Dial(
			buildWorldWSURL(testServer.URL, token, ""),
			worldDialHeader("https://play.omninudge.com"),
		)
		require.NoError(t, err)

		var joinSnapshot map[string]any
		require.NoError(t, conn.ReadJSON(&joinSnapshot))
		require.NoError(t, conn.Close())
	}

	require.Eventually(t, func() bool {
		return worldState.Player("guest-transient") == nil
	}, 5*time.Second, 20*time.Millisecond, "a client-initiated close must still remove the player")

	require.Eventually(t, func() bool {
		return runtime.NumGoroutine() <= baseline+2
	}, 5*time.Second, 50*time.Millisecond,
		"connections that ended by client close left goroutines behind: %d now, %d before", runtime.NumGoroutine(), baseline)
}

// shortSessionTTL is the life of a deliberately short-lived world token. It is
// two seconds rather than milliseconds because a JWT exp is serialised to
// whole-second precision: a sub-second expiry truncates down and can land in
// the past before the dial, which would fail validation instead of exercising
// the live-session cut this file is about. Two seconds leaves at least one
// full second of validity however the truncation falls.
const shortSessionTTL = 2 * time.Second

func newExpiryTestServer(t *testing.T) (*world.World, *httptest.Server, *services.AuthService) {
	t.Helper()

	worldState := world.NewWorld(world.DefaultConfig())
	mediaState := world.NewMediaState()
	authService := services.NewAuthService(expiryTestJWTSecret, "OmniRaveWorld/1.0", "")
	testServer := httptest.NewServer(New(worldState, mediaState, authService, []string{"https://play.omninudge.com"}))
	t.Cleanup(testServer.Close)

	return worldState, testServer, authService
}

const expiryTestJWTSecret = "dev-secret"

// newWorldSessionTokenWithTTL mints a world token by hand because
// GenerateOmniRaveWorldJWT fixes the life at five minutes, which no test can
// wait out. Everything else about the claims matches what that issuer
// produces, so the only thing under test is when the token stops being valid.
func newWorldSessionTokenWithTTL(t *testing.T, authService *services.AuthService, playerID, playerName string, ttl time.Duration) string {
	t.Helper()

	now := time.Now()
	claims := services.OmniRaveWorldJWTClaims{
		Use:        "omnirave_world",
		PlayerID:   playerID,
		PlayerName: playerName,
		Mode:       "guest",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "OmniNudge",
		},
	}

	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(expiryTestJWTSecret))
	require.NoError(t, err)

	// A token this test cannot get past the door would make every assertion
	// below vacuous.
	_, err = authService.ValidateOmniRaveWorldJWTContext(context.Background(), token)
	require.NoError(t, err, "the short-lived token must be valid at the moment it is minted")

	return token
}

func isTimeout(err error) bool {
	type timeouter interface{ Timeout() bool }
	var t timeouter
	if errors.As(err, &t) {
		return t.Timeout()
	}
	return false
}

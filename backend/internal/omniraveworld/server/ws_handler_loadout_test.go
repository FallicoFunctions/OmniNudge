package server

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

// A guest's avatar is generated client-side, so the ONLY way it reaches other
// players is this event. The published loadout must land on the sending
// player and be visible in the snapshot every other connection receives.
func TestWSHandler_LoadoutEventPublishesAvatarToOtherConnections(t *testing.T) {
	worldState := world.NewWorld(world.DefaultConfig())
	mediaState := world.NewMediaState()
	authService := services.NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	testServer := httptest.NewServer(New(worldState, mediaState, authService, []string{"https://play.omninudge.com"}))
	defer testServer.Close()

	baseURL := "ws" + testServer.URL[len("http"):] + "/ws"
	firstConn, _, err := websocket.DefaultDialer.Dial(baseURL+"?token="+newGuestWorldSessionToken(t, authService, "guest-1", "Guest-1", nil), worldDialHeader("https://play.omninudge.com"))
	require.NoError(t, err)
	defer func() { _ = firstConn.Close() }()

	secondConn, _, err := websocket.DefaultDialer.Dial(baseURL+"?token="+newGuestWorldSessionToken(t, authService, "guest-2", "Guest-2", nil), worldDialHeader("https://play.omninudge.com"))
	require.NoError(t, err)
	defer func() { _ = secondConn.Close() }()

	var firstSnapshot map[string]any
	require.NoError(t, firstConn.ReadJSON(&firstSnapshot))

	var secondJoinSnapshot map[string]any
	require.NoError(t, secondConn.ReadJSON(&secondJoinSnapshot))
	require.Nil(t, playerLoadoutForID(t, secondJoinSnapshot, "guest-1"))

	require.NoError(t, firstConn.WriteJSON(map[string]any{
		"type": "loadout",
		"loadout": map[string]string{
			"av": "1",
			"bb": "f",
			"ht": "68",
			"tp": "mesh-neon",
		},
	}))

	_ = secondConn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var broadcast map[string]any
	require.NoError(t, secondConn.ReadJSON(&broadcast))
	require.Equal(t, "world_snapshot", broadcast["type"])
	require.Equal(t, map[string]any{
		"av": "1",
		"bb": "f",
		"ht": "68",
		"tp": "mesh-neon",
	}, playerLoadoutForID(t, broadcast, "guest-1"))

	// The sender's own world state carries the same avatar it published.
	require.Equal(t, world.Loadout{"av": "1", "bb": "f", "ht": "68", "tp": "mesh-neon"}, worldState.Player("guest-1").Loadout)
}

// Rejected payloads must be ignored outright: the player keeps whatever
// avatar they already had rather than losing it to a garbage event.
func TestWSHandler_RejectedLoadoutLeavesExistingAvatarIntact(t *testing.T) {
	worldState := world.NewWorld(world.DefaultConfig())
	mediaState := world.NewMediaState()
	authService := services.NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	testServer := httptest.NewServer(New(worldState, mediaState, authService, []string{"https://play.omninudge.com"}))
	defer testServer.Close()

	wsURL := buildWorldWSURL(testServer.URL, newGuestWorldSessionToken(t, authService, "guest-1", "Guest-1", nil), "")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, worldDialHeader("https://play.omninudge.com"))
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	var joinSnapshot map[string]any
	require.NoError(t, conn.ReadJSON(&joinSnapshot))

	require.NoError(t, conn.WriteJSON(map[string]any{
		"type":    "loadout",
		"loadout": map[string]string{"tp": "mesh-neon"},
	}))

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var accepted map[string]any
	require.NoError(t, conn.ReadJSON(&accepted))
	require.Equal(t, map[string]any{"tp": "mesh-neon"}, playerLoadoutForID(t, accepted, "guest-1"))

	// Oversized value: over the shared world.MaxLoadoutValueLength budget but
	// still inside the 4096-byte frame limit, so it reaches the validator.
	require.NoError(t, conn.WriteJSON(map[string]any{
		"type":    "loadout",
		"loadout": map[string]string{"tp": strings.Repeat("v", world.MaxLoadoutValueLength+1)},
	}))
	// An empty loadout is not a way to blank an avatar either.
	require.NoError(t, conn.WriteJSON(map[string]any{
		"type":    "loadout",
		"loadout": map[string]string{},
	}))

	// Neither event may broadcast, so the next frame the client sees is the
	// one this move triggers - and it still carries the accepted avatar.
	time.Sleep(60 * time.Millisecond) // stay under the server's inbound rate limit
	require.NoError(t, conn.WriteJSON(map[string]any{
		"type":   "move",
		"moveTo": map[string]float64{"x": 0, "y": 0, "z": 0},
	}))

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var afterMove map[string]any
	require.NoError(t, conn.ReadJSON(&afterMove))
	require.Equal(t, map[string]any{"tp": "mesh-neon"}, playerLoadoutForID(t, afterMove, "guest-1"))
	require.Equal(t, world.Loadout{"tp": "mesh-neon"}, worldState.Player("guest-1").Loadout)
}

func TestSanitizeLoadout(t *testing.T) {
	tests := []struct {
		name string
		raw  world.Loadout
		want world.Loadout
		ok   bool
	}{
		{
			name: "clean payload passes through",
			raw:  world.Loadout{"av": "1", "tp": "mesh-neon"},
			want: world.Loadout{"av": "1", "tp": "mesh-neon"},
			ok:   true,
		},
		{
			name: "control runes stripped from keys and values",
			raw:  world.Loadout{"t\x00p": "mesh\x07-neon\n", "hc": "\x1b[31mred"},
			want: world.Loadout{"tp": "mesh-neon", "hc": "[31mred"},
			ok:   true,
		},
		{
			name: "key that is only control runes is rejected",
			raw:  world.Loadout{"\x00\x07": "mesh-neon"},
			ok:   false,
		},
		{
			name: "nil payload is rejected",
			raw:  nil,
			ok:   false,
		},
		{
			name: "empty payload is rejected",
			raw:  world.Loadout{},
			ok:   false,
		},
		{
			name: "oversized value is rejected",
			raw:  world.Loadout{"tp": strings.Repeat("v", world.MaxLoadoutValueLength+1)},
			ok:   false,
		},
		{
			name: "oversized key is rejected",
			raw:  world.Loadout{strings.Repeat("k", world.MaxLoadoutKeyLength+1): "v"},
			ok:   false,
		},
		{
			name: "too many keys rejected",
			raw:  oversizedLoadout(world.MaxLoadoutKeys + 1),
			ok:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := sanitizeLoadout(tt.raw)
			require.Equal(t, tt.ok, ok)
			if tt.ok {
				require.Equal(t, tt.want, got)
				return
			}
			require.Nil(t, got)
		})
	}
}

func oversizedLoadout(count int) world.Loadout {
	loadout := make(world.Loadout, count)
	for i := 0; i < count; i++ {
		loadout[string(rune('a'+i%26))+strings.Repeat("x", i/26+1)] = "v"
	}
	return loadout
}

func playerLoadoutForID(t *testing.T, snapshot map[string]any, playerID string) map[string]any {
	t.Helper()

	players, ok := snapshot["players"].([]any)
	require.True(t, ok)

	for _, rawPlayer := range players {
		player, playerOK := rawPlayer.(map[string]any)
		require.True(t, playerOK)
		if player["id"] == playerID {
			if player["loadout"] == nil {
				return nil
			}
			loadout, loadoutOK := player["loadout"].(map[string]any)
			require.True(t, loadoutOK)
			return loadout
		}
	}

	t.Fatalf("player %s not found in snapshot", playerID)
	return nil
}

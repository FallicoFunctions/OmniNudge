package server

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestWSHandler_CrouchAndStandingReachOtherPlayers(t *testing.T) {
	state := world.NewWorld(world.DefaultConfig())
	auth := services.NewAuthService("local-crouch-test", "OmniRaveWorld/1.0", "")
	server := httptest.NewServer(New(state, world.NewMediaState(), auth, []string{"https://play.omninudge.com"}))
	defer server.Close()
	connect := func(id string) *websocket.Conn {
		conn, _, err := websocket.DefaultDialer.Dial("ws"+server.URL[len("http"):]+"/ws?token="+newGuestWorldSessionToken(t, auth, id, id, nil), worldDialHeader("https://play.omninudge.com"))
		require.NoError(t, err)
		t.Cleanup(func() { conn.Close() })
		return conn
	}
	first, observer := connect("first"), connect("observer")
	position := state.Config().SpawnPoint
	awaitPosture := func(crouched bool) {
		_ = observer.SetReadDeadline(time.Now().Add(2 * time.Second))
		for {
			var snapshot world.Snapshot
			require.NoError(t, observer.ReadJSON(&snapshot))
			for _, player := range snapshot.Players {
				if player.ID == "first" && player.Crouched == crouched {
					return
				}
			}
		}
	}
	require.NoError(t, first.WriteJSON(world.ClientEvent{Type: "move", MoveTo: &position, Crouched: true}))
	awaitPosture(true)
	// Posture is independent of horizontal movement and is not saved as clothing.
	require.NoError(t, first.WriteJSON(world.ClientEvent{Type: "move", MoveTo: &position}))
	awaitPosture(false)
	require.Empty(t, state.Player("first").Loadout)
	require.NoError(t, first.WriteJSON(world.ClientEvent{Type: "move", MoveTo: &position, Crouched: true}))
	awaitPosture(true)
	require.NoError(t, first.WriteJSON(world.ClientEvent{Type: "respawn"}))
	awaitPosture(false)
}

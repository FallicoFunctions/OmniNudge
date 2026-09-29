package main

import (
	"context"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	omnigamemodel "github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omniraveworld/server"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestLocalRuntimeOrigin(t *testing.T) {
	for _, raw := range []string{"http://127.0.0.1:4175", "http://localhost:5197/", "http://[::1]:4175"} {
		origin, err := localRuntimeOrigin(raw)
		require.NoError(t, err)
		require.Equal(t, strings.TrimSuffix(raw, "/"), origin)
	}
	for _, raw := range []string{"https://example.com", "http://192.168.1.2:4175", "http://127.0.0.1.example.com", "http://user:secret@localhost", "http://localhost/path", "http://localhost/?token=value", "http://localhost/#fragment", "file:///tmp/review", "http://[broken"} {
		_, err := localRuntimeOrigin(raw)
		require.Error(t, err, raw)
	}
}

func TestAccountReviewLinksRestoreSavedEditsWithSeparateProfileCredentials(t *testing.T) {
	auth := services.NewAuthService("local-review-test-secret", "OmniRaveWorld/1.0", "")
	sessions, err := newReviewAccounts(auth, "http://127.0.0.1:5199", "ws://127.0.0.1:5198/ws")
	require.NoError(t, err)
	links, err := accountLinks(sessions)
	require.NoError(t, err)
	require.Len(t, links, 4)
	for _, link := range links {
		u, err := url.Parse(link.URL)
		require.NoError(t, err)
		require.Empty(t, u.Query().Get("wtoken"))
		require.Empty(t, u.Query().Get("sessionToken"))
		require.Empty(t, u.Query().Get("avatarComplete"))
		response, err := sessions.ExchangeLaunchSession(context.Background(), omnigamemodel.SessionExchangeRequest{
			Handoff: u.Query().Get("handoff"), Mode: omnigamemodel.LaunchModeAccount,
		})
		require.NoError(t, err)
		require.Equal(t, "110111", response.Loadout["cw"])
		claims, err := auth.ValidateJWT(response.SessionToken)
		require.NoError(t, err)
		require.Equal(t, "game", claims.Use)
		response.Loadout["cw"] = "010111"
		require.NoError(t, sessions.ProfileService().SaveLoadout(context.Background(), claims.UserID, response.Loadout))
		// Return to the initial fixture state for the next renderer's launch.
		fresh, err := sessions.ProfileService().GetProfile(context.Background(), claims.UserID)
		require.NoError(t, err)
		require.Equal(t, "010111", fresh.Loadout["cw"])
		fresh.Loadout["cw"] = "110111"
		require.NoError(t, sessions.ProfileService().SaveLoadout(context.Background(), claims.UserID, fresh.Loadout))
	}
}

func TestBrowserLinksJoinTheLocalRoomWithSeparateCharacterIdentities(t *testing.T) {
	auth := services.NewAuthService("local-review-test-secret", "OmniRaveWorld/1.0", "")
	links, err := browserLinks(auth, "http://127.0.0.1:4175", "ws://127.0.0.1:5198/ws")
	require.NoError(t, err)
	require.Len(t, links, 8)
	for _, link := range links {
		u, err := url.Parse(link.URL)
		require.NoError(t, err)
		q := u.Query()
		require.Equal(t, "ws://127.0.0.1:5198/ws", q.Get("world"))
		require.Contains(t, []string{"webgpu", "webgl"}, q.Get("perf"))
		claims, err := auth.ValidateOmniRaveWorldJWTContext(context.Background(), q.Get("wtoken"))
		require.NoError(t, err)
		character := q.Get("avatarComplete")
		if strings.Contains(link.Label, "saved outfit") {
			require.Empty(t, character)
			character = claims.Loadout["cp"]
			require.Equal(t, "110111", claims.Loadout["cw"])
		}
		require.Equal(t, "review-"+character, claims.PlayerID)
		require.Equal(t, "guest", claims.Mode)
		require.Equal(t, -45.0, claims.ReturnPoint.Z)
	}
}

func TestSyntheticPeersUseRealLoadoutsMovementAndDeparture(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	auth := services.NewAuthService("local-review-test-secret", "OmniRaveWorld/1.0", "")
	state := world.NewWorld(world.DefaultConfig())
	origin := "http://127.0.0.1:4175"
	httpServer := httptest.NewServer(server.NewWithScheduler(ctx, state, world.NewMediaStateWithPlaylists(nil, time.Now()), auth, []string{origin}))
	defer httpServer.Close()
	var snapshots atomic.Int64
	connections, err := connectPeers(ctx, auth, origin, "ws"+strings.TrimPrefix(httpServer.URL, "http")+"/ws", 3, true, &snapshots)
	require.NoError(t, err)
	defer func() {
		for _, conn := range connections {
			_ = conn.Close()
		}
	}()
	require.Eventually(t, func() bool {
		snapshot := state.SnapshotForPlayer("review-male", nil, nil)
		if len(snapshot.Players) != 3 || snapshots.Load() == 0 {
			return false
		}
		moved := 0
		for _, player := range snapshot.Players {
			if player.Position.Z != -49 {
				moved++
			}
		}
		return moved == 2
	}, 3*time.Second, 20*time.Millisecond)
	for _, player := range state.SnapshotForPlayer("review-male", nil, nil).Players {
		require.Equal(t, "1", player.Loadout["cv"])
		require.Equal(t, "111111", player.Loadout["cw"])
		if player.ID == "peer-1" {
			require.Equal(t, "female", player.Loadout["cp"])
		}
		if player.ID == "peer-0" {
			require.Equal(t, -49.0, player.Position.Z)
		}
	}
	for _, conn := range connections {
		require.NoError(t, conn.Close())
	}
	require.Eventually(t, func() bool { return len(state.SnapshotForPlayer("review-male", nil, nil).Players) == 0 }, time.Second, 10*time.Millisecond)
}

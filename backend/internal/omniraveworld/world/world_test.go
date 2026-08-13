package world

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWorld_AddPlayerUsesFixedSpawn(t *testing.T) {
	world := NewWorld(DefaultConfig())

	player := world.AddPlayer(PlayerSession{
		PlayerID: "guest-1",
		Mode:     SessionModeGuest,
	})

	require.Equal(t, world.Config().SpawnPoint, player.Position)
	require.Equal(t, ZoneMainStage, player.Zone)
}

func TestWorld_CrossingBoundaryChangesZone(t *testing.T) {
	world := NewWorld(DefaultConfig())
	player := world.AddPlayer(PlayerSession{PlayerID: "user-1"})

	for i := 0; i < 50; i++ {
		world.ApplyInput(player.ID, InputFrame{MoveTo: Vec3{X: 42, Y: 0, Z: 40}})
	}

	require.Equal(t, ZoneUnderground, world.Player(player.ID).Zone)
}

func TestWorld_ApplyInput_ClampsContinuousMovement(t *testing.T) {
	world := NewWorld(DefaultConfig())
	player := world.AddPlayer(PlayerSession{PlayerID: "guest-1"})

	world.ApplyInput(player.ID, InputFrame{MoveTo: Vec3{X: 400, Y: 0, Z: 0}})

	require.Greater(t, world.Player(player.ID).Position.X, 0.0)
	require.Less(t, world.Player(player.ID).Position.X, 400.0)
	require.Equal(t, ZoneMainStage, world.Player(player.ID).Zone)
}

func TestWorld_RespawnPlayer_ReturnsToCurrentVenueSpawn(t *testing.T) {
	world := NewWorld(DefaultConfig())
	player := world.AddPlayer(PlayerSession{PlayerID: "guest-1"})

	for i := 0; i < 50; i++ {
		world.ApplyInput(player.ID, InputFrame{MoveTo: Vec3{X: 50, Y: 0, Z: 40}})
	}
	require.Equal(t, ZoneUnderground, world.Player(player.ID).Zone)

	world.RespawnPlayer(player.ID)

	require.Equal(t, Vec3{X: 42, Y: 0, Z: 36}, world.Player(player.ID).Position)
	require.Equal(t, ZoneUnderground, world.Player(player.ID).Zone)
}

func TestWorld_RemovePlayer_OnlyDeletesMatchingSession(t *testing.T) {
	world := NewWorld(DefaultConfig())

	staleSession := world.AddPlayer(PlayerSession{PlayerID: "guest-1"})

	// Simulate a reconnect: the same player ID joins again before the stale
	// connection's deferred cleanup has a chance to run.
	freshSession := world.AddPlayer(PlayerSession{PlayerID: "guest-1"})
	require.NotSame(t, staleSession, freshSession)

	// The stale connection's cleanup fires late; it must not evict the
	// reconnected player's entry.
	world.RemovePlayer("guest-1", staleSession)
	require.Same(t, freshSession, world.Player("guest-1"))

	// The fresh connection's own cleanup still works.
	world.RemovePlayer("guest-1", freshSession)
	require.Nil(t, world.Player("guest-1"))
}

func TestSnapshotIncludesPlayerIdentityMetadata(t *testing.T) {
	world := NewWorld(DefaultConfig())
	world.AddPlayer(PlayerSession{
		PlayerID:   "guest-1",
		PlayerName: "Guest-4821",
		Mode:       SessionModeGuest,
		Loadout:    Loadout{"body": "guest-default"},
	})

	snapshot := world.SnapshotForPlayer("guest-1", nil, nil)
	require.Len(t, snapshot.Players, 1)
	require.Equal(t, "Guest-4821", snapshot.Players[0].PlayerName)
	require.Equal(t, SessionModeGuest, snapshot.Players[0].Mode)
	require.Equal(t, "guest-default", snapshot.Players[0].Loadout["body"])
}

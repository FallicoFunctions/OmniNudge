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

	for i := 0; i < 20; i++ {
		world.ApplyInput(player.ID, InputFrame{MoveTo: Vec3{X: 42, Y: 0, Z: 9}})
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

	for i := 0; i < 20; i++ {
		world.ApplyInput(player.ID, InputFrame{MoveTo: Vec3{X: 50, Y: 0, Z: 9}})
	}
	require.Equal(t, ZoneUnderground, world.Player(player.ID).Zone)

	world.RespawnPlayer(player.ID)

	require.Equal(t, Vec3{X: 42, Y: 0, Z: 9}, world.Player(player.ID).Position)
	require.Equal(t, ZoneUnderground, world.Player(player.ID).Zone)
}

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

	world.ApplyInput(player.ID, InputFrame{MoveTo: Vec3{X: 42, Y: 0, Z: 9}})

	require.Equal(t, ZoneTechnoRoom, world.Player(player.ID).Zone)
}

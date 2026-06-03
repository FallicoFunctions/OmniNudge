package world

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWorld_LoadSignedInReturnPoint(t *testing.T) {
	world := NewWorld(DefaultConfig())
	player := world.AddPlayer(PlayerSession{
		PlayerID:    "user-42",
		ReturnPoint: &Vec3{X: 12, Y: 0, Z: 8},
	})

	require.Equal(t, Vec3{X: 12, Y: 0, Z: 8}, player.Position)
}

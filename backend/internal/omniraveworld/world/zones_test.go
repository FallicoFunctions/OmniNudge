package world

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestZoneForReturnsExpectedStage(t *testing.T) {
	zones := DefaultZoneMap()

	require.Equal(t, ZoneMainStage, zones.ZoneFor(Vec3{X: 0, Y: 0, Z: 0}))
	require.Equal(t, ZoneTechnoRoom, zones.ZoneFor(Vec3{X: 42, Y: 0, Z: 9}))
	require.Equal(t, ZoneNeonRoom, zones.ZoneFor(Vec3{X: -34, Y: 0, Z: 11}))
}

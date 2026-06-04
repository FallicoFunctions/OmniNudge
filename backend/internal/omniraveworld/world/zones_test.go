package world

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDefaultZoneMap_UsesApprovedVenueIDs(t *testing.T) {
	zoneMap := DefaultZoneMap()

	mainZone := zoneMap.ZoneFor(Vec3{X: 0, Y: 0, Z: 0})
	undergroundZone := zoneMap.ZoneFor(Vec3{X: 42, Y: 0, Z: 9})
	plurrZone := zoneMap.ZoneFor(Vec3{X: -34, Y: 0, Z: 11})

	require.Equal(t, ZoneMainStage, mainZone)
	require.Equal(t, ZoneUnderground, undergroundZone)
	require.Equal(t, ZonePlurrPartay, plurrZone)
}

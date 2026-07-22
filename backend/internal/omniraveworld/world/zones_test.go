package world

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDefaultZoneMap_UsesApprovedVenueIDs(t *testing.T) {
	zoneMap := DefaultZoneMap()

	mainZone := zoneMap.ZoneFor(Vec3{X: 0, Y: 0, Z: -48})
	undergroundZone := zoneMap.ZoneFor(Vec3{X: 42, Y: 0, Z: 40})
	plurrZone := zoneMap.ZoneFor(Vec3{X: -34, Y: 0, Z: 40})

	require.Equal(t, ZoneMainStage, mainZone)
	require.Equal(t, ZoneUnderground, undergroundZone)
	require.Equal(t, ZonePlurrPartay, plurrZone)
}

func TestLayout_UsesApprovedVenueSpawnsAndBoundaries(t *testing.T) {
	layout := DefaultLayout()

	require.Equal(t, Vec3{X: 0, Y: 0, Z: -48}, layout.SpawnFor(ZoneMainStage))
	require.Equal(t, Vec3{X: 42, Y: 0, Z: 36}, layout.SpawnFor(ZoneUnderground))
	require.Equal(t, Vec3{X: -34, Y: 0, Z: 36}, layout.SpawnFor(ZonePlurrPartay))

	require.Equal(t, ZoneMainStage, layout.ZoneFor(Vec3{X: -8, Y: 0, Z: 6}))
	require.Equal(t, ZoneUnderground, layout.ZoneFor(Vec3{X: 42, Y: 0, Z: 40}))
	require.Equal(t, ZonePlurrPartay, layout.ZoneFor(Vec3{X: -34, Y: 0, Z: 40}))

	require.True(t, layout.IsUndergroundBoundaryPoint(Vec3{X: 20, Y: 0, Z: 24}))
	require.True(t, layout.IsPlurrBoundaryPoint(Vec3{X: -20, Y: 0, Z: 24}))
}

package world

import (
	"math"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLayout_SpawnFor_ReturnsPrimaryPointWhenUnoccupied(t *testing.T) {
	layout := DefaultLayout()

	spawn := layout.SpawnFor(ZoneMainStage, nil)

	require.Equal(t, Vec3{X: 0, Y: 0, Z: -48}, spawn)
}

func TestLayout_SpawnFor_FallsBackWithin15FeetWhenPrimaryIsCrowded(t *testing.T) {
	layout := DefaultLayout()
	primary := Vec3{X: 0, Y: 0, Z: -48}

	spawn := layout.SpawnFor(ZoneMainStage, []Vec3{primary})

	require.NotEqual(t, primary, spawn)
	distance := math.Hypot(spawn.X-primary.X, spawn.Z-primary.Z)
	require.LessOrEqual(t, distance, spawnFallbackRadiusMeters+0.001)
	// The fallback point must stay inside the Main Stage rectangle.
	require.True(t, layout.IsWalkable(spawn))
}

func TestLayout_SpawnFor_PicksAnUncrowdedFallbackCandidate(t *testing.T) {
	layout := DefaultLayout()
	primary := Vec3{X: 0, Y: 0, Z: -48}

	// Occupy the primary point and every fallback candidate except the last
	// ring position, so the function is forced to walk the whole ring.
	occupied := []Vec3{primary}
	ring := spawnFallbackRing(primary)
	occupied = append(occupied, ring[:len(ring)-1]...)

	spawn := layout.SpawnFor(ZoneMainStage, occupied)

	last := ring[len(ring)-1]
	require.InDelta(t, last.X, spawn.X, 0.001)
	require.InDelta(t, last.Z, spawn.Z, 0.001)
}

func TestLayout_SpawnFor_ReusesPrimaryWhenEntireZoneIsCrowded(t *testing.T) {
	layout := DefaultLayout()
	primary := Vec3{X: 0, Y: 0, Z: -48}

	occupied := append([]Vec3{primary}, spawnFallbackRing(primary)...)

	spawn := layout.SpawnFor(ZoneMainStage, occupied)

	require.Equal(t, primary, spawn)
}

func TestLayout_SpawnFor_UnknownZoneFallsBackToMainStage(t *testing.T) {
	layout := DefaultLayout()

	spawn := layout.SpawnFor(ZoneID("not-a-real-zone"), nil)

	require.Equal(t, Vec3{X: 0, Y: 0, Z: -48}, spawn)
}

func TestClampToBounds_KeepsPointsInsideTheRectangle(t *testing.T) {
	bounds := Bounds{MinX: -10, MaxX: 10, MinZ: -10, MaxZ: 10}

	clamped := clampToBounds(Vec3{X: 25, Y: 0, Z: -25}, bounds)

	require.Equal(t, Vec3{X: 10, Y: 0, Z: -10}, clamped)
}

func TestIsSpawnCrowded_ThresholdBehavior(t *testing.T) {
	point := Vec3{X: 0, Y: 0, Z: 0}

	require.True(t, isSpawnCrowded(point, []Vec3{{X: 1, Y: 0, Z: 0}}))
	require.False(t, isSpawnCrowded(point, []Vec3{{X: 10, Y: 0, Z: 0}}))
	require.False(t, isSpawnCrowded(point, nil))
}

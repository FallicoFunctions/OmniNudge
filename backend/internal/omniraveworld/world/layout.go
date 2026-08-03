package world

import "math"

// Sec 8: spawn is "one exact point plus a 15-foot fallback zone shaped to
// venue geometry", used when the exact point is occupied. 15ft ~= 4.572m.
// spawnCrowdRadius is how close another player has to be to the CANDIDATE
// point to count as "occupying" it - smaller than the fallback radius itself,
// so points near the edge of the zone aren't rejected by someone standing
// all the way over at the primary point.
const spawnFallbackRadiusMeters = 4.572
const spawnCrowdRadiusMeters = 1.5

type layoutZone struct {
	id     ZoneID
	bounds Bounds
}

type Layout struct {
	spawns map[ZoneID]Vec3
	zones  []layoutZone
}

// DefaultLayout defines the authored server-side venue rectangles.
//
// ZoneMainStage now matches the real Main Stage venue built in the Babylon
// runtime: walkable ground spans x -64..64, z -90..24 (the client owns
// fine-grained collision against envelope walls/props inside that rectangle;
// the server only does coarse bounds sanity). ZoneUnderground and
// ZonePlurrPartay are future venues that have not been built in the runtime
// yet - they keep placeholder rectangles, but those rectangles have been
// moved so their interiors no longer overlap the Main Stage rectangle: they
// now start exactly at z=24, sharing only the Main Stage's back edge as a
// touching border rather than overlapping its interior. Zone classification
// in ZoneFor/IsWalkable therefore stays unambiguous everywhere except that
// single shared edge line, which resolves deterministically to whichever
// zone is listed first below (Underground/PlurrPartay before MainStage) -
// this also keeps the walkable area contiguous (no unwalkable gap a player
// could get stuck against while crossing from one venue to the next). When
// these venues are actually built, replace their bounds/spawns with verified
// runtime dimensions the same way Main Stage was updated here.
func DefaultLayout() Layout {
	return Layout{
		spawns: map[ZoneID]Vec3{
			ZoneMainStage:   {X: 0, Y: 0, Z: -48},
			ZoneUnderground: {X: 42, Y: 0, Z: 36},
			ZonePlurrPartay: {X: -34, Y: 0, Z: 36},
		},
		zones: []layoutZone{
			{id: ZoneUnderground, bounds: Bounds{MinX: 18, MaxX: 60, MinZ: 24, MaxZ: 48}},
			{id: ZonePlurrPartay, bounds: Bounds{MinX: -52, MaxX: -18, MinZ: 24, MaxZ: 48}},
			{id: ZoneMainStage, bounds: Bounds{MinX: -64, MaxX: 64, MinZ: -90, MaxZ: 24}},
		},
	}
}

// SpawnFor returns zone's spawn point, falling back to one of a ring of
// candidate points within spawnFallbackRadiusMeters of the primary point when
// the primary point is occupied (any position in `occupied` within
// spawnCrowdRadiusMeters of it). Candidates are clamped to the zone's own
// bounds rectangle, so "shaped to venue geometry" at this coarse
// server-authority level just means "still inside the zone" - fine per-object
// obstacle avoidance is the client's own collision, same as normal movement.
// occupied may be nil (e.g. process boot, before anyone has joined).
func (l Layout) SpawnFor(zone ZoneID, occupied []Vec3) Vec3 {
	primary, ok := l.spawns[zone]
	if !ok {
		primary = l.spawns[ZoneMainStage]
		zone = ZoneMainStage
	}

	bounds, hasBounds := l.boundsFor(zone)
	if !isSpawnCrowded(primary, occupied) {
		return primary
	}

	for _, candidate := range spawnFallbackRing(primary) {
		if hasBounds {
			candidate = clampToBounds(candidate, bounds)
		}
		if !isSpawnCrowded(candidate, occupied) {
			return candidate
		}
	}

	// Every candidate is crowded (a packed venue): don't dead-end, just reuse
	// the primary point - stacking briefly is better than refusing to spawn.
	return primary
}

func (l Layout) boundsFor(zone ZoneID) (Bounds, bool) {
	for _, z := range l.zones {
		if z.id == zone {
			return z.bounds, true
		}
	}
	return Bounds{}, false
}

// spawnFallbackRing returns 8 candidate points evenly spaced around center at
// spawnFallbackRadiusMeters - a coarse approximation of "a 15-foot fallback
// zone", cheap enough to compute per spawn without authoring per-venue shapes
// by hand until real venue geometry is available server-side.
func spawnFallbackRing(center Vec3) []Vec3 {
	const points = 8
	ring := make([]Vec3, points)
	for i := 0; i < points; i++ {
		angle := 2 * math.Pi * float64(i) / float64(points)
		ring[i] = Vec3{
			X: center.X + spawnFallbackRadiusMeters*math.Cos(angle),
			Y: center.Y,
			Z: center.Z + spawnFallbackRadiusMeters*math.Sin(angle),
		}
	}
	return ring
}

func clampToBounds(point Vec3, bounds Bounds) Vec3 {
	point.X = math.Min(bounds.MaxX, math.Max(bounds.MinX, point.X))
	point.Z = math.Min(bounds.MaxZ, math.Max(bounds.MinZ, point.Z))
	return point
}

func isSpawnCrowded(point Vec3, occupied []Vec3) bool {
	for _, other := range occupied {
		dx := point.X - other.X
		dz := point.Z - other.Z
		if dx*dx+dz*dz <= spawnCrowdRadiusMeters*spawnCrowdRadiusMeters {
			return true
		}
	}
	return false
}

func (l Layout) ZoneFor(point Vec3) ZoneID {
	for _, zone := range l.zones {
		if zone.bounds.Contains(point) {
			return zone.id
		}
	}
	return ZoneMainStage
}

func (l Layout) IsWalkable(point Vec3) bool {
	for _, zone := range l.zones {
		if zone.bounds.Contains(point) {
			return true
		}
	}
	return false
}

// IsUndergroundBoundaryPoint/IsPlurrBoundaryPoint mark the transition strip
// straddling the shared edge (z=24) between each placeholder venue and the
// Main Stage rectangle (see DefaultLayout).
func (l Layout) IsUndergroundBoundaryPoint(point Vec3) bool {
	return point.X >= 18 && point.X <= 22 && point.Z >= 22 && point.Z <= 26
}

func (l Layout) IsPlurrBoundaryPoint(point Vec3) bool {
	return point.X >= -22 && point.X <= -18 && point.Z >= 22 && point.Z <= 26
}

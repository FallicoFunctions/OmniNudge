package world

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

func (l Layout) SpawnFor(zone ZoneID) Vec3 {
	spawn, ok := l.spawns[zone]
	if ok {
		return spawn
	}
	return l.spawns[ZoneMainStage]
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

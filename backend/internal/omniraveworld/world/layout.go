package world

type layoutZone struct {
	id     ZoneID
	bounds Bounds
}

type Layout struct {
	spawns map[ZoneID]Vec3
	zones  []layoutZone
}

func DefaultLayout() Layout {
	return Layout{
		spawns: map[ZoneID]Vec3{
			ZoneMainStage:   {X: 0, Y: 0, Z: 0},
			ZoneUnderground: {X: 42, Y: 0, Z: 9},
			ZonePlurrPartay: {X: -34, Y: 0, Z: 11},
		},
		zones: []layoutZone{
			{id: ZoneUnderground, bounds: Bounds{MinX: 18, MaxX: 60, MinZ: -4, MaxZ: 20}},
			{id: ZonePlurrPartay, bounds: Bounds{MinX: -52, MaxX: -18, MinZ: -4, MaxZ: 22}},
			{id: ZoneMainStage, bounds: Bounds{MinX: -24, MaxX: 24, MinZ: -24, MaxZ: 24}},
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

func (l Layout) IsUndergroundBoundaryPoint(point Vec3) bool {
	return point.X >= 17 && point.X <= 19 && point.Z >= 4 && point.Z <= 8
}

func (l Layout) IsPlurrBoundaryPoint(point Vec3) bool {
	return point.X >= -19 && point.X <= -17 && point.Z >= 2 && point.Z <= 6
}

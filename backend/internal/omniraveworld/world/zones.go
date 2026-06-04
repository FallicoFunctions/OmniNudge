package world

type Bounds struct {
	MinX float64
	MaxX float64
	MinZ float64
	MaxZ float64
}

func (b Bounds) Contains(position Vec3) bool {
	return position.X >= b.MinX && position.X <= b.MaxX && position.Z >= b.MinZ && position.Z <= b.MaxZ
}

type ZoneMap struct {
	zones map[ZoneID]Bounds
}

func DefaultZoneMap() ZoneMap {
	return ZoneMap{
		zones: map[ZoneID]Bounds{
			ZoneMainStage:   {MinX: -20, MaxX: 20, MinZ: -20, MaxZ: 20},
			ZoneUnderground: {MinX: 30, MaxX: 60, MinZ: 0, MaxZ: 20},
			ZonePlurrPartay: {MinX: -50, MaxX: -20, MinZ: 0, MaxZ: 20},
		},
	}
}

func (m ZoneMap) ZoneFor(position Vec3) ZoneID {
	for zone, bounds := range m.zones {
		if bounds.Contains(position) {
			return zone
		}
	}
	return ZoneMainStage
}

type WalkableMap struct {
	bounds Bounds
}

func (w WalkableMap) ResolveMove(_ Vec3, frame InputFrame) Vec3 {
	return frame.MoveTo
}

func (w WalkableMap) IsValid(position Vec3) bool {
	return w.bounds.Contains(position)
}

type Config struct {
	SpawnPoint Vec3
	ZoneMap    ZoneMap
	Walkable   WalkableMap
}

func DefaultConfig() Config {
	return Config{
		SpawnPoint: Vec3{X: 0, Y: 0, Z: 0},
		ZoneMap:    DefaultZoneMap(),
		Walkable:   WalkableMap{bounds: Bounds{MinX: -60, MaxX: 60, MinZ: -30, MaxZ: 30}},
	}
}

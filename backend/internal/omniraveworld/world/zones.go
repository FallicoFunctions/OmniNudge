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
	layout Layout
}

func DefaultZoneMap() ZoneMap {
	return ZoneMap{layout: DefaultLayout()}
}

func (m ZoneMap) ZoneFor(position Vec3) ZoneID {
	return m.layout.ZoneFor(position)
}

// SpawnFor returns a spawn point for zone, deconflicting against occupied
// positions per sec 8's 15-foot fallback zone (see Layout.SpawnFor).
func (m ZoneMap) SpawnFor(zone ZoneID, occupied []Vec3) Vec3 {
	return m.layout.SpawnFor(zone, occupied)
}

type WalkableMap struct {
	layout Layout
}

func (w WalkableMap) IsValid(position Vec3) bool {
	return w.layout.IsWalkable(position)
}

type Config struct {
	SpawnPoint Vec3
	ZoneMap    ZoneMap
	Walkable   WalkableMap
}

func DefaultConfig() Config {
	layout := DefaultLayout()
	return Config{
		SpawnPoint: layout.SpawnFor(ZoneMainStage, nil),
		ZoneMap:    ZoneMap{layout: layout},
		Walkable:   WalkableMap{layout: layout},
	}
}

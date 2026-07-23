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
		SpawnPoint: layout.SpawnFor(ZoneMainStage),
		ZoneMap:    ZoneMap{layout: layout},
		Walkable:   WalkableMap{layout: layout},
	}
}

package world

type ZoneID string

const (
	ZoneMainStage  ZoneID = "main_stage"
	ZoneTechnoRoom ZoneID = "techno_room"
	ZoneNeonRoom   ZoneID = "neon_room"
)

type Player struct {
	ID       string  `json:"id"`
	Position Vec3    `json:"position"`
	Zone     ZoneID  `json:"zone"`
	Loadout  Loadout `json:"loadout"`
}

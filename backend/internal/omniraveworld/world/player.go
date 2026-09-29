package world

type ZoneID string

const (
	ZoneMainStage   ZoneID = "main_stage"
	ZoneUnderground ZoneID = "underground"
	ZonePlurrPartay ZoneID = "plurr_partay"
)

type Player struct {
	ShowPanel    string      `json:"showPanel,omitempty"`
	ShowRevision uint64      `json:"showRevision,omitempty"`
	ID           string      `json:"id"`
	PlayerName   string      `json:"playerName"`
	Mode         SessionMode `json:"mode"`
	Position     Vec3        `json:"position"`
	Crouched     bool        `json:"crouched,omitempty"`
	Zone         ZoneID      `json:"zone"`
	Loadout      Loadout     `json:"loadout"`
}

package world

type SessionMode string

const (
	SessionModeAccount SessionMode = "account"
	SessionModeGuest   SessionMode = "guest"
)

type Vec3 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

type Loadout map[string]string

type PlayerSession struct {
	PlayerID    string
	PlayerName  string
	Mode        SessionMode
	Loadout     Loadout
	ReturnPoint *Vec3
}

type InputFrame struct {
	MoveTo Vec3 `json:"moveTo"`
}

type Snapshot struct {
	Players         []*Player        `json:"players"`
	ZoneMedia       []ZoneMediaState `json:"zoneMedia,omitempty"`
	ZoneEvents      []ZoneEventState `json:"zoneEvents,omitempty"`
	CurrentPlayerID string           `json:"currentPlayerId,omitempty"`
	ActiveZone      ZoneID           `json:"activeZone"`
}

type ClientEvent struct {
	Type string `json:"type"`
	// MoveTo carries a "move" event's target position.
	MoveTo *Vec3 `json:"moveTo,omitempty"`
	// Body carries a "chat" event's message body.
	Body string `json:"body,omitempty"`
	// Loadout carries a "loadout" event's avatar description. It is UNTRUSTED
	// client input: the handler validates it with ValidateLoadout and strips
	// control characters before it is applied and broadcast.
	Loadout Loadout `json:"loadout,omitempty"`
}

type ZoneMediaState struct {
	ZoneID          ZoneID `json:"zoneId"`
	TrackID         string `json:"trackId"`
	Artist          string `json:"artist"`
	Title           string `json:"title"`
	PlaylistIndex   int    `json:"playlistIndex"`
	PlayheadSeconds int64  `json:"playheadSeconds"`
	DurationSeconds int64  `json:"durationSeconds"`
}

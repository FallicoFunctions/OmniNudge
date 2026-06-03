package world

type ReconnectState struct {
	PlayerID string `json:"playerId"`
	Zone     ZoneID `json:"zone"`
}

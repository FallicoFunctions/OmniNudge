package model

type LaunchMode string

const (
	LaunchModeAccount LaunchMode = "account"
	LaunchModeGuest   LaunchMode = "guest"
)

type PlayerIdentity struct {
	UserID       *int
	Username     string
	TokenVersion int
	RemoteIP     string
}

type LaunchRequest struct {
	Mode LaunchMode `json:"mode"`
}

type LaunchSession struct {
	GameSlug     string     `json:"gameSlug"`
	Mode         LaunchMode `json:"mode"`
	LaunchToken  string     `json:"launchToken"`
	PlayerID     string     `json:"playerId"`
	GuestName    string     `json:"guestName,omitempty"`
	PlayerName   string     `json:"playerName"`
	UserID       *int       `json:"userId,omitempty"`
	TokenVersion int        `json:"-"`
}

type SavedPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

type OmniRaveProfile struct {
	UserID      int               `json:"userId"`
	Loadout     map[string]string `json:"loadout"`
	ReturnPoint *SavedPoint       `json:"returnPoint,omitempty"`
}

type LaunchResponse struct {
	LaunchURL string `json:"launch_url"`
}

type SessionExchangeRequest struct {
	Handoff  string     `json:"handoff"`
	Mode     LaunchMode `json:"mode"`
	RemoteIP string     `json:"-"`
}

type SessionExchangeResponse struct {
	PlayerID          string            `json:"playerId"`
	PlayerName        string            `json:"playerName"`
	SessionToken      string            `json:"sessionToken,omitempty"`
	WorldSessionToken string            `json:"worldSessionToken,omitempty"`
	WorldSocketURL    string            `json:"worldSocketUrl"`
	Mode              LaunchMode        `json:"mode"`
	ActiveZone        string            `json:"activeZone"`
	Loadout           map[string]string `json:"loadout,omitempty"`
	ZoneMedia         []ZoneMediaState  `json:"zoneMedia,omitempty"`
	ReturnPoint       *SavedPoint       `json:"returnPoint,omitempty"`
}

type ZoneMediaState struct {
	ZoneID          string `json:"zoneId"`
	VideoID         string `json:"videoId"`
	PlaylistIndex   int    `json:"playlistIndex"`
	PlayheadSeconds int64  `json:"playheadSeconds"`
}

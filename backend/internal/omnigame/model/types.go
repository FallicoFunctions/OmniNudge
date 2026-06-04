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

type OmniRaveSettings struct {
	UITheme       string `json:"uiTheme"`
	GraphicsMode  string `json:"graphicsMode"`
	GraphicsLevel int    `json:"graphicsLevel,omitempty"`
	DisplayNames  bool   `json:"displayNames"`
	ChatCollapsed bool   `json:"chatCollapsed"`
	CrouchMode    string `json:"crouchMode"`
	CameraFollow  string `json:"cameraFollow"`
}

func DefaultOmniRaveSettings() OmniRaveSettings {
	return OmniRaveSettings{
		UITheme:       "Luminous Panels",
		GraphicsMode:  "auto",
		DisplayNames:  true,
		ChatCollapsed: false,
		CrouchMode:    "hold",
		CameraFollow:  "free",
	}
}

type OmniRaveProfile struct {
	UserID      int               `json:"userId"`
	Loadout     map[string]string `json:"loadout"`
	ReturnPoint *SavedPoint       `json:"returnPoint,omitempty"`
	LastVenue   string            `json:"lastVenue"`
	Settings    OmniRaveSettings  `json:"settings"`
}

func DefaultOmniRaveProfile(userID int) OmniRaveProfile {
	return OmniRaveProfile{
		UserID:    userID,
		Loadout:   map[string]string{},
		LastVenue: "main_stage",
		Settings:  DefaultOmniRaveSettings(),
	}
}

func NormalizeOmniRaveProfile(profile OmniRaveProfile) OmniRaveProfile {
	if profile.Loadout == nil {
		profile.Loadout = map[string]string{}
	}
	if profile.LastVenue == "" {
		profile.LastVenue = "main_stage"
	}

	if profile.Settings == (OmniRaveSettings{}) {
		profile.Settings = DefaultOmniRaveSettings()
	}

	return profile
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
	LastVenue         string            `json:"lastVenue"`
	Settings          OmniRaveSettings  `json:"settings"`
	ZoneMedia         []ZoneMediaState  `json:"zoneMedia,omitempty"`
	ReturnPoint       *SavedPoint       `json:"returnPoint,omitempty"`
}

type ZoneMediaState struct {
	ZoneID          string `json:"zoneId"`
	VideoID         string `json:"videoId"`
	PlaylistIndex   int    `json:"playlistIndex"`
	PlayheadSeconds int64  `json:"playheadSeconds"`
}

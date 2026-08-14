package model

type LaunchMode string

const (
	LaunchModeAccount LaunchMode = "account"
	LaunchModeGuest   LaunchMode = "guest"
)

// SubjectKind names what a world session belongs to.
//
// It is carried explicitly rather than read off whether UserID happens to be
// set. Today nil means guest, which works only because there are exactly two
// kinds of player. A persona has no user id either, so under the old reading it
// would be indistinguishable from a guest and would silently inherit guest
// semantics -- no persistence, no revocation handle -- which is the opposite of
// what a persona is for. Stating the kind removes the ambiguity before there is
// a third kind to be ambiguous about.
type SubjectKind string

const (
	SubjectKindAccount SubjectKind = "account"
	SubjectKindGuest   SubjectKind = "guest"
	SubjectKindPersona SubjectKind = "persona"
)

// Valid reports whether the kind is one this build understands. Callers reject
// on false rather than falling back to a default, so that an issuer this build
// does not know about cannot admit a subject by leaving the kind off.
func (k SubjectKind) Valid() bool {
	switch k {
	case SubjectKindAccount, SubjectKindGuest, SubjectKindPersona:
		return true
	default:
		return false
	}
}

type PlayerIdentity struct {
	UserID       *int
	Username     string
	TokenVersion int
	RemoteIP     string

	// Kind may be empty on identities built by code that predates it; use
	// ResolvedKind rather than reading this directly.
	Kind SubjectKind
}

// ResolvedKind reports the identity's kind, deriving one when the caller has
// not set it.
//
// Derivation only ever yields account or guest. A persona is never inferred,
// because inferring a persona from an absent field is exactly the confusion
// this type exists to prevent: a persona has to be stated by whoever admitted
// it, and nothing else may conclude it.
func (p PlayerIdentity) ResolvedKind() SubjectKind {
	if p.Kind.Valid() {
		return p.Kind
	}
	if p.UserID != nil {
		return SubjectKindAccount
	}
	return SubjectKindGuest
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

// ResidentRef names whose world state a row belongs to. A persona has no user
// id, so a resident cannot be identified by one; the kind and the id together
// are what make the reference unambiguous across kinds that reuse numbering.
type ResidentRef struct {
	Kind SubjectKind `json:"kind"`
	ID   int64       `json:"id"`
}

func (r ResidentRef) Valid() bool {
	return r.Kind.Valid() && r.ID > 0
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

	// Subject is which resident this row belongs to: the repository's key, not
	// anything the client asked for or can act on. It is kept out of the API
	// shape entirely rather than merely renamed -- it had been carrying
	// omitempty, which does nothing on a struct, so the profile endpoint was
	// returning it unconditionally with Go-cased keys.
	//
	// It may be zero on profiles built by code that predates it; use
	// ResolvedSubject rather than reading this directly.
	Subject ResidentRef `json:"-"`
}

// ResolvedSubject returns Subject when set, otherwise derives the account
// subject from UserID, so callers written before the field keep working.
//
// Derivation only ever yields an account subject. A persona is never inferred,
// for the same reason PlayerIdentity refuses to infer one: a persona has to be
// stated by whoever created it, and an absent field is not a statement.
func (p OmniRaveProfile) ResolvedSubject() ResidentRef {
	if p.Subject.Valid() {
		return p.Subject
	}
	return ResidentRef{Kind: SubjectKindAccount, ID: int64(p.UserID)}
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
	ZoneEvents        []ZoneEventState  `json:"zoneEvents,omitempty"`
	ReturnPoint       *SavedPoint       `json:"returnPoint,omitempty"`
}

// PersonaAdmission is what the agent runtime gets back when a character is
// admitted to a world. It carries no session token and no user-shaped field:
// the runtime is acting as the character, not as anybody signed in, and the
// world token is the only thing it needs to connect.
type PersonaAdmission struct {
	WorldSessionToken string `json:"worldSessionToken"`
	PlayerID          string `json:"playerId"`
	PlayerName        string `json:"playerName"`
}

type RuntimeAuthRequest struct {
	Username            string            `json:"username,omitempty"`
	Email               string            `json:"email,omitempty"`
	Password            string            `json:"password,omitempty"`
	TurnstileToken      string            `json:"turnstileToken,omitempty"`
	AcceptPrivacyPolicy bool              `json:"acceptPrivacyPolicy"`
	AcceptTerms         bool              `json:"acceptTerms"`
	CurrentVenue        string            `json:"currentVenue"`
	CurrentLoadout      map[string]string `json:"currentLoadout,omitempty"`
	CurrentSettings     OmniRaveSettings  `json:"currentSettings"`
}

type RuntimeAuthResponse = SessionExchangeResponse

type ZoneMediaState struct {
	ZoneID          string `json:"zoneId"`
	VideoID         string `json:"videoId"`
	PlaylistIndex   int    `json:"playlistIndex"`
	PlayheadSeconds int64  `json:"playheadSeconds"`
}

type ZoneEventState struct {
	ZoneID           string `json:"zoneId"`
	Phase            string `json:"phase"`
	EventName        string `json:"eventName"`
	CountdownSeconds int64  `json:"countdownSeconds,omitempty"`
	RecoverySeconds  int64  `json:"recoverySeconds,omitempty"`
	ActiveMinute     int    `json:"activeMinute,omitempty"`
}

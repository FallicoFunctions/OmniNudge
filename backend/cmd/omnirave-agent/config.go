package main

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Configuration is read entirely from the environment, the way the other
// binaries in this tree read theirs, and every required value is demanded up
// front rather than at the moment it is first needed. An agent that starts
// without a world-event secret would run for five minutes looking healthy and
// then fail at the one call that leaves a trace, which is the worst of both
// answers.
const (
	envPersonaID        = "OMNIRAVE_AGENT_PERSONA_ID"
	envOmniGameAPIURL   = "OMNIGAME_API_URL"
	envWorldSocketURL   = "OMNIRAVE_WORLD_SOCKET_URL"
	envRuntimeURL       = "OMNIRAVE_RUNTIME_URL"
	envAdmissionSecret  = "PERSONA_ADMISSION_SECRET"
	envWorldEventSecret = "WORLD_EVENT_SECRET"
	envJWTSecret        = "JWT_SECRET"
)

const (
	defaultOmniGameAPIURL = "http://localhost:8091"
	defaultWorldSocketURL = "ws://localhost:8092/ws"
	defaultRuntimeURL     = "http://localhost:4173/omnirave"
)

// Config is everything one character's driver needs to live somewhere.
type Config struct {
	PersonaID int64
	// OmniGameAPIURL is where admission and world events are asked for. It has
	// no trailing slash by the time it is stored.
	OmniGameAPIURL string
	// WorldSocketURL is the ws:// endpoint the world token is spent at.
	WorldSocketURL string
	// Origin is sent on the socket handshake. The world only upgrades
	// connections whose Origin is one it was configured to allow, so this is
	// derived from the same runtime URL the world derives its allow-list from
	// rather than being a separate knob to keep in agreement by hand.
	Origin string

	AdmissionSecret  string
	WorldEventSecret string
	JWTSecret        string
}

// LoadConfig reads the environment through getenv so this is testable without
// mutating the process.
//
// It reports every problem it found, not the first: an operator fixing one
// missing variable at a time, one process start at a time, is being made to
// discover the configuration by bisection.
func LoadConfig(getenv func(string) string) (Config, error) {
	var problems []string

	cfg := Config{
		OmniGameAPIURL:   strings.TrimRight(valueOr(getenv, envOmniGameAPIURL, defaultOmniGameAPIURL), "/"),
		WorldSocketURL:   valueOr(getenv, envWorldSocketURL, defaultWorldSocketURL),
		AdmissionSecret:  strings.TrimSpace(getenv(envAdmissionSecret)),
		WorldEventSecret: strings.TrimSpace(getenv(envWorldEventSecret)),
		JWTSecret:        strings.TrimSpace(getenv(envJWTSecret)),
	}

	rawPersona := strings.TrimSpace(getenv(envPersonaID))
	switch rawPersona {
	case "":
		problems = append(problems, envPersonaID+" is not set (which character should live in the world?)")
	default:
		personaID, err := strconv.ParseInt(rawPersona, 10, 64)
		if err != nil || personaID <= 0 {
			problems = append(problems, envPersonaID+" must be a positive persona id, got "+strconv.Quote(rawPersona))
		} else {
			cfg.PersonaID = personaID
		}
	}

	origin, err := originFor(valueOr(getenv, envRuntimeURL, defaultRuntimeURL))
	if err != nil {
		problems = append(problems, envRuntimeURL+" must be an absolute URL: "+err.Error())
	}
	cfg.Origin = origin

	for _, required := range []struct {
		name  string
		value string
		why   string
	}{
		{envAdmissionSecret, cfg.AdmissionSecret, "without it no character can be admitted"},
		{envWorldEventSecret, cfg.WorldEventSecret, "without it nothing the character does can be reported"},
		{envJWTSecret, cfg.JWTSecret, "the service credentials refuse to be minted with the site secret, and check against it"},
	} {
		if required.value == "" {
			problems = append(problems, required.name+" is not set ("+required.why+")")
		}
	}

	if len(problems) > 0 {
		return Config{}, fmt.Errorf("omnirave-agent is not configured:\n  - %s", strings.Join(problems, "\n  - "))
	}
	return cfg, nil
}

// AdmitURL and WorldEventURL name the two endpoints by the world they belong
// to. There is one route per world by design on the API side, so there is one
// here too rather than a mode switch.
func (c Config) AdmitURL() string {
	return c.OmniGameAPIURL + "/api/v1/omnigame/admit/omnirave"
}

func (c Config) WorldEventURL() string {
	return c.OmniGameAPIURL + "/api/v1/omnigame/world-event/omnirave"
}

// SocketURL puts the world token in the query string, which is where the
// world's upgrade handler looks for it.
func (c Config) SocketURL(worldToken string) (string, error) {
	parsed, err := url.Parse(c.WorldSocketURL)
	if err != nil {
		return "", fmt.Errorf("%s is not a URL: %w", envWorldSocketURL, err)
	}
	query := parsed.Query()
	query.Set("token", worldToken)
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

// credentialTTL is how long the admission and world-event credentials this
// process mints are good for. Both services cap it at five minutes anyway; a
// minute is all either call needs, and a credential that outlives its own use
// is one more thing that can be replayed.
const credentialTTL = time.Minute

func valueOr(getenv func(string) string, key, fallback string) string {
	if value := strings.TrimSpace(getenv(key)); value != "" {
		return value
	}
	return fallback
}

// originFor reduces the runtime URL to the scheme://host the world's
// allowedRuntimeOrigins builds from the same value.
func originFor(runtimeURL string) (string, error) {
	parsed, err := url.Parse(runtimeURL)
	if err != nil {
		return "", err
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("no scheme or host in %q", runtimeURL)
	}
	return parsed.Scheme + "://" + parsed.Host, nil
}

func osGetenv(key string) string { return os.Getenv(key) }

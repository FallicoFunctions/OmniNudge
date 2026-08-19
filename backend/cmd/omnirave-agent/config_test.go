package main

import (
	"strings"
	"testing"
)

func completeEnv() map[string]string {
	return map[string]string{
		envPersonaID:        "7",
		envAdmissionSecret:  strings.Repeat("a", 32),
		envWorldEventSecret: strings.Repeat("b", 32),
		envJWTSecret:        "site-secret",
	}
}

func getenvFrom(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func TestLoadConfigFillsDefaultsAroundTheRequiredValues(t *testing.T) {
	cfg, err := LoadConfig(getenvFrom(completeEnv()))
	if err != nil {
		t.Fatalf("expected a usable config, got %v", err)
	}

	if cfg.PersonaID != 7 {
		t.Errorf("persona id = %d, want 7", cfg.PersonaID)
	}
	if cfg.OmniGameAPIURL != defaultOmniGameAPIURL {
		t.Errorf("api url = %q, want the default", cfg.OmniGameAPIURL)
	}
	if cfg.WorldSocketURL != defaultWorldSocketURL {
		t.Errorf("world socket url = %q, want the default", cfg.WorldSocketURL)
	}
	// The origin is derived from the runtime URL rather than configured
	// separately, because the world builds its allow-list from the same value.
	if cfg.Origin != "http://localhost:4173" {
		t.Errorf("origin = %q, want the runtime URL's scheme and host", cfg.Origin)
	}
}

func TestLoadConfigReportsEveryMissingValueAtOnce(t *testing.T) {
	_, err := LoadConfig(getenvFrom(map[string]string{}))
	if err == nil {
		t.Fatal("expected a config with nothing set to be refused")
	}

	for _, name := range []string{envPersonaID, envAdmissionSecret, envWorldEventSecret, envJWTSecret} {
		if !strings.Contains(err.Error(), name) {
			t.Errorf("error does not mention %s: %v", name, err)
		}
	}
}

func TestLoadConfigRefusesANonPersonaID(t *testing.T) {
	for _, raw := range []string{"0", "-3", "nova"} {
		env := completeEnv()
		env[envPersonaID] = raw
		if _, err := LoadConfig(getenvFrom(env)); err == nil {
			t.Errorf("persona id %q was accepted", raw)
		}
	}
}

func TestLoadConfigTrimsTheAPIBaseURL(t *testing.T) {
	env := completeEnv()
	env[envOmniGameAPIURL] = "http://api.example/"
	cfg, err := LoadConfig(getenvFrom(env))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if want := "http://api.example/api/v1/omnigame/admit/omnirave"; cfg.AdmitURL() != want {
		t.Errorf("admit url = %q, want %q", cfg.AdmitURL(), want)
	}
	if want := "http://api.example/api/v1/omnigame/disposition/omnirave"; cfg.DispositionURL() != want {
		t.Errorf("DispositionURL() = %q, want %q", cfg.DispositionURL(), want)
	}
	if want := "http://api.example/api/v1/omnigame/world-event/omnirave"; cfg.WorldEventURL() != want {
		t.Errorf("world event url = %q, want %q", cfg.WorldEventURL(), want)
	}
}

func TestSocketURLCarriesTheWorldToken(t *testing.T) {
	cfg, err := LoadConfig(getenvFrom(completeEnv()))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	socketURL, err := cfg.SocketURL("world.token.value")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if want := "ws://localhost:8092/ws?token=world.token.value"; socketURL != want {
		t.Errorf("socket url = %q, want %q", socketURL, want)
	}
}

// The seed is optional, and a run given one is a run that can be reproduced.
func TestLoadConfigTakesAnOptionalSeed(t *testing.T) {
	cfg, err := LoadConfig(getenvFrom(completeEnv()))
	if err != nil {
		t.Fatalf("expected a usable config, got %v", err)
	}
	if cfg.Seed != 0 {
		t.Errorf("seed = %d, want zero so the clock supplies one", cfg.Seed)
	}

	env := completeEnv()
	env[envSeed] = "-99"
	cfg, err = LoadConfig(getenvFrom(env))
	if err != nil {
		t.Fatalf("expected a usable config, got %v", err)
	}
	if cfg.Seed != -99 {
		t.Errorf("seed = %d, want -99", cfg.Seed)
	}

	env[envSeed] = "not-a-number"
	if _, err = LoadConfig(getenvFrom(env)); err == nil {
		t.Error("a seed that is not a number should be refused at startup")
	}
}

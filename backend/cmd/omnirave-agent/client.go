package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/services"
)

// errAdmissionRefused is the answer that must not be retried quickly. The API
// gives one generic refusal for "no such character", "not a platform
// character", "private" and "retired" alike, so this process cannot tell which
// of those happened -- and does not need to. All of them mean the same thing
// here: this character is not welcome right now, and asking again in two
// seconds will not change that.
var errAdmissionRefused = errors.New("admission refused")

// errAdmissionUnavailable is admission being switched off at the API rather
// than this character being refused. Also not worth hammering.
var errAdmissionUnavailable = errors.New("admission is not configured at the API")

type apiClient struct {
	cfg         Config
	http        *http.Client
	admission   *services.PersonaAdmissionAuth
	worldEvents *services.WorldEventAuth
}

func newAPIClient(cfg Config, httpClient *http.Client) (*apiClient, error) {
	// Both credentials are minted here rather than handed in, and both refuse
	// to be built from a secret that is the site's own. That check happens now,
	// at startup, instead of at the first admission five minutes from now.
	admission, err := services.NewPersonaAdmissionAuth(cfg.AdmissionSecret, cfg.JWTSecret)
	if err != nil {
		return nil, err
	}
	worldEvents, err := services.NewWorldEventAuth(cfg.WorldEventSecret, cfg.JWTSecret)
	if err != nil {
		return nil, err
	}
	return &apiClient{cfg: cfg, http: httpClient, admission: admission, worldEvents: worldEvents}, nil
}

// admit exchanges a freshly minted admission credential for a world session
// token. The character is named inside the credential, never in the body, so
// there is nothing to send.
func (c *apiClient) admit(ctx context.Context) (*model.PersonaAdmission, error) {
	credential, err := c.admission.Mint(c.cfg.PersonaID, credentialTTL)
	if err != nil {
		return nil, fmt.Errorf("mint admission credential: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.AdmitURL(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+credential)

	response, err := c.http.Do(request)
	if err != nil {
		return nil, fmt.Errorf("admit request: %w", err)
	}
	defer func() { _ = response.Body.Close() }()

	body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	switch response.StatusCode {
	case http.StatusOK:
	case http.StatusUnauthorized, http.StatusForbidden:
		return nil, fmt.Errorf("%w (%s): %s", errAdmissionRefused, response.Status, strings.TrimSpace(string(body)))
	case http.StatusServiceUnavailable:
		return nil, fmt.Errorf("%w (%s)", errAdmissionUnavailable, response.Status)
	default:
		return nil, fmt.Errorf("admit: unexpected %s: %s", response.Status, strings.TrimSpace(string(body)))
	}

	var admission model.PersonaAdmission
	if err := json.Unmarshal(body, &admission); err != nil {
		return nil, fmt.Errorf("admit: unreadable response: %w", err)
	}
	if admission.WorldSessionToken == "" || admission.PlayerID == "" {
		return nil, errors.New("admit: response carried no world session token")
	}
	return &admission, nil
}

// reportWorldEvent files what the character did as one of its own memories.
// The world-event credential is a different credential from the admission one
// on purpose and is minted per call, so nothing long-lived is held.
func (c *apiClient) reportWorldEvent(ctx context.Context, title, summary string) error {
	credential, err := c.worldEvents.Mint(c.cfg.PersonaID, credentialTTL)
	if err != nil {
		return fmt.Errorf("mint world-event credential: %w", err)
	}

	payload, err := json.Marshal(map[string]string{"title": title, "summary": summary})
	if err != nil {
		return err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.WorldEventURL(), bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+credential)
	request.Header.Set("Content-Type", "application/json")

	response, err := c.http.Do(request)
	if err != nil {
		return fmt.Errorf("world-event request: %w", err)
	}
	defer func() { _ = response.Body.Close() }()

	body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	if response.StatusCode != http.StatusCreated {
		return fmt.Errorf("world event: unexpected %s: %s", response.Status, strings.TrimSpace(string(body)))
	}
	return nil
}

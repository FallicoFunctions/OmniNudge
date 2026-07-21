package voicebox

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/services/speech"
)

const maxSpeechBytes = 25 << 20

var presetIDPattern = regexp.MustCompile(`^[a-z]{2}_[a-z0-9]{2,40}$`)

type Client struct {
	baseURL    string
	httpClient *http.Client
	profilesMu sync.Mutex
	profiles   map[string]string
}

type profile struct {
	ID            string `json:"id"`
	VoiceType     string `json:"voice_type"`
	PresetEngine  string `json:"preset_engine"`
	PresetVoiceID string `json:"preset_voice_id"`
}

func NewClient(baseURL string, timeout time.Duration) (*Client, error) {
	return newClient(baseURL, timeout, false)
}

func newClient(baseURL string, timeout time.Duration, allowAnyLoopbackTestServer bool) (*Client, error) {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "http://127.0.0.1:17493"
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
		return nil, errors.New("invalid voicebox base URL")
	}
	ip := net.ParseIP(parsed.Hostname())
	isLoopback := strings.EqualFold(parsed.Hostname(), "localhost") || (ip != nil && ip.IsLoopback())
	if !isLoopback && !allowAnyLoopbackTestServer {
		return nil, errors.New("voicebox must use a loopback URL")
	}
	if timeout <= 0 {
		timeout = 2 * time.Minute
	}
	return &Client{
		baseURL: strings.TrimRight(parsed.String(), "/"),
		httpClient: &http.Client{
			Timeout: timeout,
			// Voicebox endpoints never redirect. Refusing redirects prevents a
			// compromised local process from forwarding private character text.
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		profiles: make(map[string]string),
	}, nil
}

func (c *Client) Configured() bool { return c != nil && c.httpClient != nil && c.baseURL != "" }

func (c *Client) Synthesize(ctx context.Context, voiceID string, request speech.Request) (*speech.Audio, error) {
	if !c.Configured() {
		return nil, errors.New("voicebox is not configured")
	}
	voiceID = strings.TrimSpace(voiceID)
	if strings.TrimSpace(request.Text) == "" || len([]rune(request.Text)) > 10_000 {
		return nil, errors.New("invalid speech text")
	}
	engine := strings.TrimSpace(request.ModelID)
	if engine == "" {
		engine = "kokoro"
	}
	if engine != "kokoro" && engine != "qwen" && engine != "luxtts" && engine != "chatterbox" && engine != "chatterbox_turbo" && engine != "tada" {
		return nil, errors.New("invalid voicebox engine")
	}
	profileID := voiceID
	if _, err := uuid.Parse(voiceID); err != nil {
		if engine != "kokoro" || !presetIDPattern.MatchString(voiceID) {
			return nil, errors.New("invalid voicebox profile")
		}
		var resolveErr error
		profileID, resolveErr = c.resolvePresetProfile(ctx, voiceID, request.VoiceName)
		if resolveErr != nil {
			return nil, resolveErr
		}
	}
	language := strings.TrimSpace(request.LanguageCode)
	if language == "" {
		language = "en"
	}
	payload := map[string]any{
		"profile_id": profileID,
		"text":       request.Text,
		"language":   language,
		"engine":     engine,
		"normalize":  true,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	response, err := c.do(ctx, http.MethodPost, "/generate/stream", body)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("voicebox generation failed with status %d", response.StatusCode)
	}
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0]))
	if contentType != "audio/wav" && contentType != "audio/x-wav" {
		return nil, errors.New("voicebox returned an invalid content type")
	}
	audio, err := io.ReadAll(io.LimitReader(response.Body, maxSpeechBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read voicebox audio: %w", err)
	}
	if len(audio) < 12 || len(audio) > maxSpeechBytes || string(audio[:4]) != "RIFF" || string(audio[8:12]) != "WAVE" {
		return nil, errors.New("voicebox returned invalid audio")
	}
	return &speech.Audio{Bytes: audio, ContentType: "audio/wav", Extension: ".wav"}, nil
}

func (c *Client) resolvePresetProfile(ctx context.Context, presetVoiceID, voiceName string) (string, error) {
	c.profilesMu.Lock()
	defer c.profilesMu.Unlock()
	if id := c.profiles[presetVoiceID]; id != "" {
		return id, nil
	}
	response, err := c.do(ctx, http.MethodGet, "/profiles", nil)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("voicebox profile lookup failed with status %d", response.StatusCode)
	}
	var profiles []profile
	if err := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&profiles); err != nil {
		return "", errors.New("voicebox returned invalid profiles")
	}
	for _, candidate := range profiles {
		if candidate.VoiceType == "preset" && candidate.PresetEngine == "kokoro" && candidate.PresetVoiceID == presetVoiceID {
			if _, err := uuid.Parse(candidate.ID); err == nil {
				c.profiles[presetVoiceID] = candidate.ID
				return candidate.ID, nil
			}
		}
	}
	voiceName = strings.TrimSpace(voiceName)
	if voiceName == "" || len([]rune(voiceName)) > 100 {
		voiceName = presetVoiceID
	}
	createBody, err := json.Marshal(map[string]any{
		"name":            "OmniChat " + voiceName,
		"description":     "OmniChat managed preset. Do not delete while assigned to a character.",
		"language":        "en",
		"voice_type":      "preset",
		"preset_engine":   "kokoro",
		"preset_voice_id": presetVoiceID,
		"default_engine":  "kokoro",
	})
	if err != nil {
		return "", err
	}
	createdResponse, err := c.do(ctx, http.MethodPost, "/profiles", createBody)
	if err != nil {
		return "", err
	}
	defer createdResponse.Body.Close()
	if createdResponse.StatusCode < 200 || createdResponse.StatusCode >= 300 {
		return "", fmt.Errorf("voicebox profile creation failed with status %d", createdResponse.StatusCode)
	}
	var created profile
	if err := json.NewDecoder(io.LimitReader(createdResponse.Body, 1<<20)).Decode(&created); err != nil {
		return "", errors.New("voicebox returned an invalid profile")
	}
	if _, err := uuid.Parse(created.ID); err != nil {
		return "", errors.New("voicebox returned an invalid profile id")
	}
	c.profiles[presetVoiceID] = created.ID
	return created.ID, nil
}

func (c *Client) do(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json, audio/wav")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("voicebox request failed: %w", err)
	}
	return response, nil
}

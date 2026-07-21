package elevenlabs

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/services/speech"
)

const maxSpeechBytes = 10 << 20

var voiceIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

type Client struct {
	apiKey        string
	baseURL       string
	enableLogging bool
	httpClient    *http.Client
}

func NewClient(apiKey, baseURL string, enableLogging bool) *Client {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.elevenlabs.io"
	}
	return &Client{
		apiKey: strings.TrimSpace(apiKey), baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"), enableLogging: enableLogging,
		httpClient: &http.Client{Timeout: 45 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		}},
	}
}

func (c *Client) Synthesize(ctx context.Context, voiceID string, request speech.Request) (*speech.Audio, error) {
	if c == nil || strings.TrimSpace(c.apiKey) == "" {
		return nil, errors.New("elevenlabs is not configured")
	}
	if !voiceIDPattern.MatchString(voiceID) {
		return nil, errors.New("invalid voice id")
	}
	if strings.TrimSpace(request.Text) == "" || len([]rune(request.Text)) > 10_000 {
		return nil, errors.New("invalid speech text")
	}
	body, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	endpoint, err := c.textToSpeechEndpoint(voiceID)
	if err != nil {
		return nil, err
	}
	query := endpoint.Query()
	query.Set("output_format", "mp3_44100_128")
	query.Set("enable_logging", fmt.Sprintf("%t", c.enableLogging))
	endpoint.RawQuery = query.Encode()
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Accept", "audio/mpeg")
	httpRequest.Header.Set("xi-api-key", c.apiKey)
	response, err := c.httpClient.Do(httpRequest)
	if err != nil {
		return nil, fmt.Errorf("elevenlabs request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("elevenlabs request failed with status %d", response.StatusCode)
	}
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0]))
	if contentType != "audio/mpeg" && contentType != "audio/mp3" {
		return nil, errors.New("elevenlabs returned an invalid content type")
	}
	audio, err := io.ReadAll(io.LimitReader(response.Body, maxSpeechBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read elevenlabs audio: %w", err)
	}
	if len(audio) == 0 || len(audio) > maxSpeechBytes {
		return nil, errors.New("elevenlabs audio size is invalid")
	}
	if !looksLikeMP3(audio) {
		return nil, errors.New("elevenlabs returned invalid audio")
	}
	return &speech.Audio{Bytes: audio, ContentType: "audio/mpeg", Extension: ".mp3"}, nil
}

func (c *Client) textToSpeechEndpoint(voiceID string) (*url.URL, error) {
	if c == nil {
		return nil, errors.New("elevenlabs is not configured")
	}
	endpoint, err := url.Parse(c.baseURL)
	if err != nil || (endpoint.Scheme != "https" && endpoint.Scheme != "http") || endpoint.Hostname() == "" ||
		endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" {
		return nil, errors.New("invalid elevenlabs base URL")
	}
	endpoint.Path = strings.TrimRight(endpoint.Path, "/") + "/v1/text-to-speech/" + voiceID
	endpoint.RawPath = ""
	return endpoint, nil
}

func looksLikeMP3(audio []byte) bool {
	if len(audio) >= 3 && string(audio[:3]) == "ID3" {
		return true
	}
	return len(audio) >= 2 && audio[0] == 0xff && audio[1]&0xe0 == 0xe0
}

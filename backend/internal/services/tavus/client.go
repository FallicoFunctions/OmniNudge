package tavus

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
)

var providerIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

const maxJSONResponseBytes = 1 << 20

type CreateConversationRequest struct {
	ReplicaID             string   `json:"replica_id"`
	PersonaID             string   `json:"persona_id"`
	AudioOnly             bool     `json:"audio_only"`
	ConversationName      string   `json:"conversation_name,omitempty"`
	ConversationalContext string   `json:"conversational_context,omitempty"`
	MemoryStores          []string `json:"memory_stores,omitempty"`
	RequireAuth           bool     `json:"require_auth"`
	MaxParticipants       int      `json:"max_participants"`
}

type Conversation struct {
	ConversationID string
	JoinURL        string
}

type Client struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

func NewClient(apiKey, baseURL string) *Client {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://tavusapi.com"
	}
	return &Client{
		apiKey: strings.TrimSpace(apiKey), baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) Configured() bool { return c != nil && c.apiKey != "" }

func (c *Client) CreateConversation(ctx context.Context, request CreateConversationRequest) (*Conversation, error) {
	if !c.Configured() {
		return nil, errors.New("live avatar video is not configured")
	}
	if !providerIDPattern.MatchString(request.ReplicaID) || !providerIDPattern.MatchString(request.PersonaID) {
		return nil, errors.New("invalid live avatar configuration")
	}
	request.RequireAuth = true
	request.AudioOnly = false
	request.MaxParticipants = 2
	if len([]rune(request.ConversationName)) > 200 || len([]rune(request.ConversationalContext)) > 20_000 || len(request.MemoryStores) > 1 {
		return nil, errors.New("invalid live avatar conversation context")
	}
	body, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v2/conversations", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Accept", "application/json")
	httpRequest.Header.Set("x-api-key", c.apiKey)
	response, err := c.httpClient.Do(httpRequest)
	if err != nil {
		return nil, fmt.Errorf("live avatar provider request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("live avatar provider returned status %d", response.StatusCode)
	}
	var providerResponse struct {
		ConversationID  string `json:"conversation_id"`
		ConversationURL string `json:"conversation_url"`
		MeetingToken    string `json:"meeting_token"`
		Status          string `json:"status"`
	}
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maxJSONResponseBytes+1))
	if err != nil {
		return nil, errors.New("live avatar provider response could not be read")
	}
	if len(responseBody) > maxJSONResponseBytes {
		return nil, errors.New("live avatar provider response exceeds size limit")
	}
	if err = json.Unmarshal(responseBody, &providerResponse); err != nil {
		return nil, errors.New("live avatar provider returned an invalid response")
	}
	if !providerIDPattern.MatchString(providerResponse.ConversationID) || providerResponse.Status != "active" || providerResponse.MeetingToken == "" {
		return nil, errors.New("live avatar provider returned an incomplete response")
	}
	joinURL, err := validatedJoinURL(providerResponse.ConversationURL, providerResponse.MeetingToken)
	if err != nil {
		return nil, err
	}
	return &Conversation{ConversationID: providerResponse.ConversationID, JoinURL: joinURL}, nil
}

func (c *Client) EndConversation(ctx context.Context, conversationID string) error {
	if !c.Configured() || !providerIDPattern.MatchString(conversationID) {
		return errors.New("invalid live avatar conversation")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v2/conversations/"+url.PathEscape(conversationID)+"/end", nil)
	if err != nil {
		return err
	}
	request.Header.Set("x-api-key", c.apiKey)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("end live avatar conversation: %w", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	if response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusConflict || response.StatusCode == http.StatusGone {
		return nil
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("live avatar provider returned status %d", response.StatusCode)
	}
	return nil
}

func validatedJoinURL(rawURL, token string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Fragment != "" {
		return "", errors.New("live avatar provider returned an invalid meeting URL")
	}
	host := strings.ToLower(parsed.Hostname())
	if host != "daily.co" && !strings.HasSuffix(host, ".daily.co") {
		return "", errors.New("live avatar provider returned an untrusted meeting URL")
	}
	query := parsed.Query()
	query.Set("t", token)
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

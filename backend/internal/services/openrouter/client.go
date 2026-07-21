// Package openrouter is a client for OpenRouter's OpenAI-compatible chat
// completions API, used to power OmniChat bot personas.
package openrouter

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	apiURL                    = "https://openrouter.ai/api/v1/chat/completions"
	maxMessages               = 128
	maxMessageRunes           = 64_000
	maxRequestRunes           = 256_000
	maxStreamLineBytes        = 1 << 20
	maxGeneratedResponseRunes = 128_000
)

var modelPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$`)

// ErrNotConfigured is returned when the client has no API key set.
var ErrNotConfigured = errors.New("openrouter: API key not configured")

// ErrRateLimited is returned when OpenRouter (or its upstream provider) rate limits the request.
var ErrRateLimited = errors.New("openrouter: rate limited")

// Role values for Message.Role.
const (
	RoleSystem    = "system"
	RoleUser      = "user"
	RoleAssistant = "assistant"
)

// Message is a single turn in a chat completion request.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// StreamCallback is invoked once per token chunk as it arrives. It may be nil.
type StreamCallback func(token string)

// Client talks to OpenRouter's chat completions API.
type Client struct {
	apiKey     string
	model      string
	endpoint   string
	httpClient *http.Client
}

// NewClient creates an OpenRouter client. apiKey may be empty; in that case
// Generate returns ErrNotConfigured.
func NewClient(apiKey, model string) *Client {
	return newClient(apiKey, model, apiURL, nil)
}

// newClient permits an isolated test endpoint while applying the same redirect
// policy as production. Completion requests contain both the API credential and
// private persona context, so redirects must never forward either to another
// origin.
func newClient(apiKey, model, endpoint string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 60 * time.Second}
	} else {
		clientCopy := *httpClient
		httpClient = &clientCopy
		if httpClient.Timeout <= 0 {
			httpClient.Timeout = 60 * time.Second
		}
	}
	httpClient.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return &Client{
		apiKey: strings.TrimSpace(apiKey), model: strings.TrimSpace(model),
		endpoint: strings.TrimSpace(endpoint), httpClient: httpClient,
	}
}

type chatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Stream   bool      `json:"stream"`
}

type streamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// rateLimitError attempts to parse OpenRouter's rate limit error response.
type rateLimitError struct {
	Error struct {
		Message  string `json:"message"`
		Metadata struct {
			RetryAfterSeconds float64 `json:"retry_after_seconds"`
		} `json:"metadata"`
	} `json:"error"`
}

// Generate runs a chat completion, streaming token chunks to onChunk as they
// arrive, and returns the full concatenated text once generation completes.
func (c *Client) Generate(ctx context.Context, messages []Message, onChunk StreamCallback) (string, error) {
	if c == nil || c.apiKey == "" {
		return "", ErrNotConfigured
	}
	if err := validateRequest(c.model, messages); err != nil {
		return "", err
	}
	if c.httpClient == nil || c.endpoint == "" {
		return "", errors.New("openrouter: client is not configured")
	}

	payload, err := json.Marshal(chatRequest{
		Model:    c.model,
		Messages: messages,
		Stream:   true,
	})
	if err != nil {
		return "", fmt.Errorf("openrouter: encode request: %w", err)
	}

	const maxRetries = 3
	backoff := 1 * time.Second

	for attempt := 1; attempt <= maxRetries; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(payload))
		if err != nil {
			return "", fmt.Errorf("openrouter: build request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
		// Recommended by OpenRouter for attribution on their model rankings; not required.
		req.Header.Set("HTTP-Referer", "https://omninudge.com")
		req.Header.Set("X-Title", "OmniChat")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			// Don't retry dial/context errors
			return "", fmt.Errorf("openrouter: request failed: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
			resp.Body.Close()

			if resp.StatusCode == http.StatusTooManyRequests {
				if attempt == maxRetries {
					return "", ErrRateLimited
				}

				// Calculate delay, respecting Retry-After if provided
				delay := backoff
				var rl rateLimitError
				if err := json.Unmarshal(body, &rl); err == nil && rl.Error.Metadata.RetryAfterSeconds > 0 {
					delay = time.Duration(rl.Error.Metadata.RetryAfterSeconds * float64(time.Second))
				}

				// Cap max delay to prevent long stalls
				if delay > 10*time.Second {
					delay = 10 * time.Second
				}

				select {
				case <-time.After(delay):
					backoff *= 2
					continue
				case <-ctx.Done():
					return "", ctx.Err()
				}
			}
			return "", fmt.Errorf("openrouter: returned status %d", resp.StatusCode)
		}

		full, err := processStream(resp.Body, onChunk)
		resp.Body.Close()
		return full, err
	}

	return "", ErrRateLimited
}

func processStream(body io.ReadCloser, onChunk StreamCallback) (string, error) {
	var full strings.Builder
	generatedRunes := 0
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), maxStreamLineBytes)

	for scanner.Scan() {
		line := scanner.Text()
		// Skip SSE comment/keep-alive lines (e.g. ": OPENROUTER PROCESSING").
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		if data == "[DONE]" {
			break
		}

		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if chunk.Error != nil {
			return full.String(), errors.New("openrouter: provider returned a streaming error")
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content == "" {
				continue
			}
			chunkRunes := utf8RuneCount(choice.Delta.Content)
			if generatedRunes+chunkRunes > maxGeneratedResponseRunes {
				return full.String(), errors.New("openrouter: generated response exceeds size limit")
			}
			full.WriteString(choice.Delta.Content)
			generatedRunes += chunkRunes
			if onChunk != nil {
				onChunk(choice.Delta.Content)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return full.String(), fmt.Errorf("openrouter: stream read error: %w", err)
	}

	return full.String(), nil
}

func validateRequest(model string, messages []Message) error {
	if !modelPattern.MatchString(model) {
		return errors.New("openrouter: model is invalid")
	}
	if len(messages) == 0 || len(messages) > maxMessages {
		return errors.New("openrouter: message count is invalid")
	}
	totalRunes := 0
	for _, message := range messages {
		if message.Role != RoleSystem && message.Role != RoleUser && message.Role != RoleAssistant {
			return errors.New("openrouter: message role is invalid")
		}
		messageRunes := utf8RuneCount(message.Content)
		if messageRunes == 0 || messageRunes > maxMessageRunes {
			return errors.New("openrouter: message content is invalid")
		}
		totalRunes += messageRunes
		if totalRunes > maxRequestRunes {
			return errors.New("openrouter: request exceeds size limit")
		}
	}
	return nil
}

func utf8RuneCount(value string) int {
	return utf8.RuneCountInString(value)
}

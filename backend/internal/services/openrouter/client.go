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
	"strings"
	"time"
)

const apiURL = "https://openrouter.ai/api/v1/chat/completions"

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
	httpClient *http.Client
}

// NewClient creates an OpenRouter client. apiKey may be empty; in that case
// Generate returns ErrNotConfigured.
func NewClient(apiKey, model string) *Client {
	return &Client{
		apiKey:     apiKey,
		model:      model,
		httpClient: &http.Client{Timeout: 60 * time.Second},
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
	if c.apiKey == "" {
		return "", ErrNotConfigured
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
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(payload))
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
					return "", fmt.Errorf("%w: %s", ErrRateLimited, string(body))
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
			return "", fmt.Errorf("openrouter: returned status %d: %s", resp.StatusCode, string(body))
		}

		full, err := processStream(resp.Body, onChunk)
		resp.Body.Close()
		return full, err
	}

	return "", ErrRateLimited
}

func processStream(body io.ReadCloser, onChunk StreamCallback) (string, error) {
	var full strings.Builder
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	
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
			return full.String(), fmt.Errorf("openrouter: %s", chunk.Error.Message)
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content == "" {
				continue
			}
			full.WriteString(choice.Delta.Content)
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

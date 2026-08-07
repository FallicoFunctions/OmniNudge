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
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	zlog "github.com/rs/zerolog/log"
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
var providerPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$`)

// IsValidModelRoute applies the same bounded syntax check used before an HTTP
// request, allowing offline evaluators to fail before creating any clients.
func IsValidModelRoute(route string) bool {
	return modelPattern.MatchString(strings.TrimSpace(route))
}

// ErrNotConfigured is returned when the client has no API key set.
var ErrNotConfigured = errors.New("openrouter: API key not configured")

// ErrRateLimited is returned when OpenRouter (or its upstream provider) rate limits the request.
var ErrRateLimited = errors.New("openrouter: rate limited")

// ErrProviderIncomplete identifies an SSE response that ended without a
// completion sentinel or contained malformed data frames. It is kept distinct
// from transport failures so privacy-safe bakeoff metrics can distinguish an
// unavailable/incomplete provider reply from a network failure.
var ErrProviderIncomplete = errors.New("openrouter: provider response incomplete")

// ErrAccessDenied identifies authentication, billing-authorization, or
// entitlement failures without disclosing which account or provider detail
// caused the denial. These failures are not transient and must not be retried.
var ErrAccessDenied = errors.New("openrouter: provider access denied")

// ErrTransportOrProvider identifies a transport or upstream-provider failure
// without requiring callers to inspect error text. Concrete errors deliberately
// keep provider bodies, request IDs, routes, and transport topology out of
// their user-visible message.
var ErrTransportOrProvider = errors.New("openrouter: transport or provider failure")

type transportOrProviderError struct {
	message string
	cause   error
}

func (e *transportOrProviderError) Error() string {
	return e.message
}

func (e *transportOrProviderError) Unwrap() error {
	return e.cause
}

func (e *transportOrProviderError) Is(target error) bool {
	return target == ErrTransportOrProvider
}

func newTransportOrProviderError(message string, cause error) error {
	return &transportOrProviderError{message: message, cause: cause}
}

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

// GenerationOptions contains bounded provider parameters that callers may
// tighten for a specific response profile.
type GenerationOptions struct {
	MaxTokens       int
	ReasoningEffort string
	Speed           string
	// ResponseFormat is an optional server-owned output contract. The only
	// supported value is json_object; callers must still validate the decoded
	// content because provider JSON mode does not enforce OmniChat semantics.
	ResponseFormat string
}

// GenerationTelemetry is aggregate, content-free transport and billing
// telemetry. It intentionally contains no prompts, responses, credentials,
// request IDs, provider names, or model routes.
type GenerationTelemetry struct {
	HTTPAttempts        int
	HTTPFailures        int
	RetryAttempts       int
	TotalAttemptLatency time.Duration
	RetryBackoff        time.Duration
	PromptTokens        int64
	CompletionTokens    int64
	ReasoningTokens     int64
	CostUSD             float64
	UsageSamples        int
	CostSamples         int
}

func (t *GenerationTelemetry) add(other GenerationTelemetry) {
	t.HTTPAttempts += other.HTTPAttempts
	t.HTTPFailures += other.HTTPFailures
	t.RetryAttempts += other.RetryAttempts
	t.TotalAttemptLatency += other.TotalAttemptLatency
	t.RetryBackoff += other.RetryBackoff
	t.PromptTokens += other.PromptTokens
	t.CompletionTokens += other.CompletionTokens
	t.ReasoningTokens += other.ReasoningTokens
	t.CostUSD += other.CostUSD
	t.UsageSamples += other.UsageSamples
	t.CostSamples += other.CostSamples
}

// StreamCallback is invoked once per token chunk as it arrives. It may be nil.
type StreamCallback func(token string)

// Client talks to OpenRouter's chat completions API.
type Client struct {
	apiKey          string
	model           string
	endpoint        string
	httpClient      *http.Client
	waitBeforeRetry func(context.Context, time.Duration) error
	telemetryMu     sync.Mutex
	telemetry       GenerationTelemetry
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
		waitBeforeRetry: waitForRetry,
	}
}

type chatRequest struct {
	Model          string                `json:"model"`
	Messages       []Message             `json:"messages"`
	Stream         bool                  `json:"stream"`
	MaxTokens      int                   `json:"max_tokens,omitempty"`
	Reasoning      *reasoningPreferences `json:"reasoning,omitempty"`
	Speed          string                `json:"speed,omitempty"`
	ResponseFormat *responseFormat       `json:"response_format,omitempty"`
	// Keep a pinned model, but let OpenRouter prefer its lowest-latency
	// compatible provider. This is routing metadata only; provider identities
	// remain server-side and are never sent to the browser.
	Provider *providerPreferences `json:"provider,omitempty"`
}

type reasoningPreferences struct {
	Effort  string `json:"effort"`
	Exclude bool   `json:"exclude"`
}

type responseFormat struct {
	Type string `json:"type"`
}

type providerPreferences struct {
	Sort              string `json:"sort"`
	RequireParameters bool   `json:"require_parameters,omitempty"`
}

type streamChunk struct {
	Model string `json:"model"`
	// Provider is intentionally raw because OpenRouter-compatible providers may
	// send either a string or an object here. Only an allowlisted identifier is
	// ever extracted and logged below.
	Provider json.RawMessage `json:"provider"`
	Choices  []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
	Error *struct {
		Code json.RawMessage `json:"code"`
	} `json:"error"`
	Usage *struct {
		PromptTokens      int64 `json:"prompt_tokens"`
		CompletionTokens  int64 `json:"completion_tokens"`
		CompletionDetails struct {
			ReasoningTokens int64 `json:"reasoning_tokens"`
		} `json:"completion_tokens_details"`
		Cost *float64 `json:"cost"`
	} `json:"usage"`
}

// streamMetadata contains only provider routing identifiers. It deliberately
// excludes prompts, completions, token counts, request IDs, and any other
// potentially user-specific data.
type streamMetadata struct {
	model    string
	provider string
}

func (m *streamMetadata) merge(other streamMetadata) {
	if other.model != "" {
		m.model = other.model
	}
	if other.provider != "" {
		m.provider = other.provider
	}
}

func routingMetadataFromHeaders(header http.Header) streamMetadata {
	return streamMetadata{
		model:    safeRoutingIdentifier(header.Get("X-OpenRouter-Model"), modelPattern),
		provider: safeRoutingIdentifier(header.Get("X-OpenRouter-Provider"), providerPattern),
	}
}

func routingMetadataFromChunk(chunk streamChunk) streamMetadata {
	metadata := streamMetadata{model: safeRoutingIdentifier(chunk.Model, modelPattern)}
	if len(chunk.Provider) == 0 {
		return metadata
	}

	var provider string
	if err := json.Unmarshal(chunk.Provider, &provider); err == nil {
		metadata.provider = safeRoutingIdentifier(provider, providerPattern)
		return metadata
	}

	var providerObject struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
		ID   string `json:"id"`
	}
	if err := json.Unmarshal(chunk.Provider, &providerObject); err == nil {
		for _, candidate := range []string{providerObject.Name, providerObject.Slug, providerObject.ID} {
			if safe := safeRoutingIdentifier(candidate, providerPattern); safe != "" {
				metadata.provider = safe
				break
			}
		}
	}
	return metadata
}

func safeRoutingIdentifier(value string, pattern *regexp.Regexp) string {
	value = strings.TrimSpace(value)
	if !pattern.MatchString(value) {
		return ""
	}
	return value
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
	return c.GenerateWithOptions(ctx, messages, onChunk, GenerationOptions{})
}

// GenerateWithOptions runs a completion with caller-supplied output bounds.
func (c *Client) GenerateWithOptions(ctx context.Context, messages []Message, onChunk StreamCallback, options GenerationOptions) (string, error) {
	startedAt := time.Now()
	var routing streamMetadata
	statusCode := 0
	succeeded := false
	defer func() {
		event := zlog.Info().
			Str("operation", "chat_completion").
			Int64("duration_ms", time.Since(startedAt).Milliseconds()).
			Int("status_code", statusCode).
			Bool("success", succeeded)
		// Never add provider/model routes, request IDs, prompts, or response
		// content to this event; bake-off output must remain blind.
		event.Msg("openrouter: completion finished")
	}()

	if c == nil || c.apiKey == "" {
		return "", ErrNotConfigured
	}
	if err := validateRequest(c.model, messages); err != nil {
		return "", err
	}
	if options.MaxTokens < 0 || options.MaxTokens > 4096 {
		return "", errors.New("openrouter: max tokens is invalid")
	}
	effort := strings.ToLower(strings.TrimSpace(options.ReasoningEffort))
	speed := strings.ToLower(strings.TrimSpace(options.Speed))
	responseFormatName := strings.ToLower(strings.TrimSpace(options.ResponseFormat))
	if !validReasoningEffort(effort) || (speed != "" && speed != "fast") ||
		(responseFormatName != "" && responseFormatName != "json_object") {
		return "", errors.New("openrouter: generation options are invalid")
	}
	if c.httpClient == nil || c.endpoint == "" {
		return "", errors.New("openrouter: client is not configured")
	}
	var callTelemetry GenerationTelemetry
	defer c.recordTelemetry(&callTelemetry)

	var reasoning *reasoningPreferences
	if effort != "" {
		reasoning = &reasoningPreferences{Effort: effort, Exclude: true}
	}
	payload, err := json.Marshal(chatRequest{
		Model:     c.model,
		Messages:  messages,
		Stream:    true,
		MaxTokens: options.MaxTokens,
		Reasoning: reasoning,
		Speed:     speed,
		ResponseFormat: func() *responseFormat {
			if responseFormatName == "" {
				return nil
			}
			return &responseFormat{Type: responseFormatName}
		}(),
		// Structured recovery must never be routed through a provider that
		// silently ignores response_format. OpenRouter's require_parameters
		// flag makes that contract fail closed while preserving the normal
		// latency preference for unstructured requests.
		Provider: &providerPreferences{
			Sort:              "latency",
			RequireParameters: responseFormatName != "",
		},
	})
	if err != nil {
		return "", fmt.Errorf("openrouter: encode request: %w", err)
	}

	const maxRetries = 3
	backoff := 1 * time.Second

	for attempt := 1; attempt <= maxRetries; attempt++ {
		attemptStartedAt := time.Now()
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
			callTelemetry.HTTPAttempts++
			callTelemetry.HTTPFailures++
			callTelemetry.TotalAttemptLatency += time.Since(attemptStartedAt)
			// Don't retry dial/context errors
			return "", newTransportOrProviderError("openrouter: request failed", err)
		}
		statusCode = resp.StatusCode
		routing.merge(routingMetadataFromHeaders(resp.Header))

		if resp.StatusCode != http.StatusOK {
			var body []byte
			if !httpStatusIsAccessDenied(resp.StatusCode) {
				body, _ = io.ReadAll(io.LimitReader(resp.Body, 2048))
			}
			closeOpenRouterResponseBody(resp.Body)
			callTelemetry.HTTPAttempts++
			callTelemetry.HTTPFailures++
			callTelemetry.TotalAttemptLatency += time.Since(attemptStartedAt)

			if httpStatusIsAccessDenied(resp.StatusCode) {
				return "", ErrAccessDenied
			}

			if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable {
				if attempt == maxRetries {
					if resp.StatusCode == http.StatusTooManyRequests {
						return "", ErrRateLimited
					}
					return "", newTransportOrProviderError(fmt.Sprintf("openrouter: returned status %d", resp.StatusCode), nil)
				}

				// Calculate delay, respecting Retry-After if provided
				delay := backoff
				headerDelay, fromHeader := retryAfterDelay(resp.Header.Get("Retry-After"), time.Now())
				if fromHeader {
					delay = headerDelay
				}
				var rl rateLimitError
				if !fromHeader {
					if err := json.Unmarshal(body, &rl); err == nil && rl.Error.Metadata.RetryAfterSeconds > 0 {
						delay = time.Duration(rl.Error.Metadata.RetryAfterSeconds * float64(time.Second))
					}
				}

				// Cap max delay to prevent long stalls
				if delay > 10*time.Second {
					delay = 10 * time.Second
				}

				callTelemetry.RetryAttempts++
				callTelemetry.RetryBackoff += delay
				if err := c.waitBeforeRetry(ctx, delay); err != nil {
					return "", err
				}
				backoff *= 2
				continue
			}
			return "", newTransportOrProviderError(fmt.Sprintf("openrouter: returned status %d", resp.StatusCode), nil)
		}

		full, streamRouting, usage, err := processStreamWithTelemetry(resp.Body, onChunk)
		closeOpenRouterResponseBody(resp.Body)
		callTelemetry.HTTPAttempts++
		callTelemetry.TotalAttemptLatency += time.Since(attemptStartedAt)
		callTelemetry.add(usage)
		if err != nil {
			callTelemetry.HTTPFailures++
		}
		routing.merge(streamRouting)
		succeeded = err == nil
		return full, err
	}

	return "", ErrRateLimited
}

func httpStatusIsAccessDenied(statusCode int) bool {
	return statusCode == http.StatusUnauthorized ||
		statusCode == http.StatusPaymentRequired ||
		statusCode == http.StatusForbidden
}

// closeOpenRouterResponseBody observes close failures without allowing a
// transport cleanup error to replace a completed provider response or a more
// useful HTTP status. Request bodies never contain credentials or prompt text,
// but keep the log free of the raw error because transports can include host
// topology in their messages.
func closeOpenRouterResponseBody(body io.Closer) {
	if body == nil {
		return
	}
	if err := body.Close(); err != nil {
		zlog.Warn().Msg("openrouter: response body close failed")
	}
}

func waitForRetry(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func retryAfterDelay(value string, now time.Time) (time.Duration, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	if seconds, err := strconv.ParseFloat(value, 64); err == nil && seconds >= 0 {
		return time.Duration(seconds * float64(time.Second)), true
	}
	if when, err := http.ParseTime(value); err == nil {
		delay := when.Sub(now)
		if delay < 0 {
			delay = 0
		}
		return delay, true
	}
	return 0, false
}

func (c *Client) recordTelemetry(telemetry *GenerationTelemetry) {
	if c == nil || telemetry == nil {
		return
	}
	c.telemetryMu.Lock()
	c.telemetry.add(*telemetry)
	c.telemetryMu.Unlock()
}

// TelemetrySnapshot returns a cumulative content-free snapshot for callers
// such as the synthetic bake-off. Callers can diff snapshots around one
// generation when they need per-call accounting.
func (c *Client) TelemetrySnapshot() GenerationTelemetry {
	if c == nil {
		return GenerationTelemetry{}
	}
	c.telemetryMu.Lock()
	defer c.telemetryMu.Unlock()
	return c.telemetry
}

func validReasoningEffort(effort string) bool {
	switch effort {
	case "", "low", "medium", "high", "xhigh", "max":
		return true
	default:
		return false
	}
}

func processStream(body io.ReadCloser, onChunk StreamCallback) (string, error) {
	full, _, _, err := processStreamWithTelemetry(body, onChunk)
	return full, err
}

func processStreamWithMetadata(body io.ReadCloser, onChunk StreamCallback) (string, streamMetadata, error) {
	full, routing, _, err := processStreamWithTelemetry(body, onChunk)
	return full, routing, err
}

func processStreamWithTelemetry(body io.ReadCloser, onChunk StreamCallback) (string, streamMetadata, GenerationTelemetry, error) {
	var full strings.Builder
	var routing streamMetadata
	var telemetry GenerationTelemetry
	generatedRunes := 0
	sawDone := false
	malformedData := false
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
			sawDone = true
			break
		}

		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			// A malformed data frame cannot be ignored: doing so could turn a
			// truncated or provider-corrupted response into deliverable text.
			// Keep the concrete parser error out of logs and user-facing errors.
			malformedData = true
			continue
		}
		routing.merge(routingMetadataFromChunk(chunk))
		if chunk.Usage != nil {
			telemetry.PromptTokens += chunk.Usage.PromptTokens
			telemetry.CompletionTokens += chunk.Usage.CompletionTokens
			telemetry.ReasoningTokens += chunk.Usage.CompletionDetails.ReasoningTokens
			telemetry.UsageSamples++
			if chunk.Usage.Cost != nil {
				telemetry.CostUSD += *chunk.Usage.Cost
				telemetry.CostSamples++
			}
		}
		if chunk.Error != nil {
			if streamErrorCodeIsAccessDenied(chunk.Error.Code) {
				return full.String(), routing, telemetry, ErrAccessDenied
			}
			return full.String(), routing, telemetry, newTransportOrProviderError("openrouter: provider returned a streaming error", nil)
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content == "" {
				continue
			}
			chunkRunes := utf8RuneCount(choice.Delta.Content)
			if generatedRunes+chunkRunes > maxGeneratedResponseRunes {
				return full.String(), routing, telemetry, errors.New("openrouter: generated response exceeds size limit")
			}
			full.WriteString(choice.Delta.Content)
			generatedRunes += chunkRunes
			if onChunk != nil {
				onChunk(choice.Delta.Content)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return full.String(), routing, telemetry, newTransportOrProviderError("openrouter: stream read error", err)
	}
	if malformedData {
		return full.String(), routing, telemetry, fmt.Errorf("%w: malformed streaming data", ErrProviderIncomplete)
	}
	if !sawDone {
		return full.String(), routing, telemetry, fmt.Errorf("%w: stream ended before completion", ErrProviderIncomplete)
	}

	return full.String(), routing, telemetry, nil
}

func streamErrorCodeIsAccessDenied(code json.RawMessage) bool {
	switch strings.TrimSpace(string(code)) {
	case "401", "402", "403", `"401"`, `"402"`, `"403"`:
		return true
	default:
		return false
	}
}

func validateRequest(model string, messages []Message) error {
	if !IsValidModelRoute(model) {
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

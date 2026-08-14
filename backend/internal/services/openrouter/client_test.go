package openrouter

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestGenerateWithOptionsSendsCompletionTokenLimit(t *testing.T) {
	var received chatRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, json.NewDecoder(r.Body).Decode(&received))
		w.Header().Set("Content-Type", "text/event-stream")
		_, err := io.WriteString(w, "data: [DONE]\n\n")
		require.NoError(t, err)
	}))
	defer server.Close()
	client := newClient("secret-key", "openrouter/free", server.URL, server.Client())

	_, err := client.GenerateWithOptions(context.Background(), []Message{{Role: RoleUser, Content: "hello"}}, nil, GenerationOptions{MaxTokens: 256})

	require.NoError(t, err)
	require.Equal(t, 256, received.MaxTokens)
	require.NotNil(t, received.Provider)
	require.Equal(t, "latency", received.Provider.Sort)
	require.False(t, received.Provider.RequireParameters)
}

func TestGenerateWithOptionsSendsServerOwnedReasoningAndSpeedProfile(t *testing.T) {
	var received chatRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, json.NewDecoder(r.Body).Decode(&received))
		w.Header().Set("Content-Type", "text/event-stream")
		_, err := io.WriteString(w, "data: [DONE]\n\n")
		require.NoError(t, err)
	}))
	defer server.Close()
	client := newClient("secret-key", "anthropic/claude-opus-4.8", server.URL, server.Client())

	_, err := client.GenerateWithOptions(context.Background(), []Message{{Role: RoleUser, Content: "hello"}}, nil, GenerationOptions{
		MaxTokens:       256,
		ReasoningEffort: "high",
		Speed:           "fast",
	})

	require.NoError(t, err)
	require.NotNil(t, received.Reasoning)
	require.Equal(t, "high", received.Reasoning.Effort)
	require.True(t, received.Reasoning.Exclude)
	require.Equal(t, "fast", received.Speed)
}

func TestGenerateWithOptionsSendsJSONResponseFormat(t *testing.T) {
	var received chatRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, json.NewDecoder(r.Body).Decode(&received))
		w.Header().Set("Content-Type", "text/event-stream")
		_, err := io.WriteString(w, "data: [DONE]\n\n")
		require.NoError(t, err)
	}))
	defer server.Close()
	client := newClient("secret-key", "openai/gpt-5-mini", server.URL, server.Client())

	_, err := client.GenerateWithOptions(context.Background(), []Message{{Role: RoleUser, Content: "hello"}}, nil, GenerationOptions{ResponseFormat: "json_object"})

	require.NoError(t, err)
	require.Equal(t, &responseFormat{Type: "json_object"}, received.ResponseFormat)
	require.NotNil(t, received.Provider)
	require.True(t, received.Provider.RequireParameters)
}

func TestGenerateWithOptionsRejectsUnknownProviderControlsBeforeRequest(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		calls.Add(1)
	}))
	defer server.Close()
	client := newClient("secret-key", "anthropic/claude-sonnet-5", server.URL, server.Client())

	_, err := client.GenerateWithOptions(context.Background(), []Message{{Role: RoleUser, Content: "hello"}}, nil, GenerationOptions{
		ReasoningEffort: "ultrathink",
		Speed:           "turbo",
		ResponseFormat:  "xml",
	})

	require.EqualError(t, err, "openrouter: generation options are invalid")
	require.Zero(t, calls.Load())
}

func TestClientDoesNotFollowCrossHostRedirectWithCredential(t *testing.T) {
	var targetRequests atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		targetRequests.Add(1)
		require.Empty(t, r.Header.Get("Authorization"))
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer origin.Close()

	client := newClient("secret-key", "openrouter/free", origin.URL, origin.Client())
	_, err := client.Generate(context.Background(), []Message{{Role: RoleUser, Content: "hello"}}, nil)

	require.Error(t, err)
	require.Zero(t, targetRequests.Load())
}

func TestClientRejectsOversizedRequestBeforeCallingProvider(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		calls.Add(1)
	}))
	defer server.Close()
	client := newClient("secret-key", "openrouter/free", server.URL, server.Client())

	_, err := client.Generate(context.Background(), []Message{{Role: RoleUser, Content: strings.Repeat("x", maxMessageRunes+1)}}, nil)

	require.EqualError(t, err, "openrouter: message content is invalid")
	require.Zero(t, calls.Load())
}

func TestClientDoesNotExposeProviderErrorBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "provider stack trace secret", http.StatusInternalServerError)
	}))
	defer server.Close()
	client := newClient("secret-key", "openrouter/free", server.URL, server.Client())

	_, err := client.Generate(context.Background(), []Message{{Role: RoleUser, Content: "hello"}}, nil)

	require.EqualError(t, err, "openrouter: returned status 500")
	require.ErrorIs(t, err, ErrTransportOrProvider)
}

func TestClientFailsFastOnProviderAccessDenialWithoutExposingBody(t *testing.T) {
	for _, statusCode := range []int{
		http.StatusUnauthorized,
		http.StatusPaymentRequired,
		http.StatusForbidden,
	} {
		t.Run(http.StatusText(statusCode), func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls.Add(1)
				http.Error(w, "secret billing and account detail", statusCode)
			}))
			defer server.Close()
			client := newClient("secret-key", "openrouter/free", server.URL, server.Client())

			_, err := client.Generate(context.Background(), []Message{{Role: RoleUser, Content: "hello"}}, nil)

			require.EqualError(t, err, "openrouter: provider access denied")
			require.ErrorIs(t, err, ErrAccessDenied)
			require.NotContains(t, err.Error(), "billing")
			require.NotContains(t, err.Error(), "account")
			require.EqualValues(t, 1, calls.Load(), "access denial must never be retried")
		})
	}
}

func TestProcessStreamTypesProviderAndTransportFailuresWithoutExposingDetails(t *testing.T) {
	providerBody := io.NopCloser(strings.NewReader("data: {\"error\":{\"message\":\"secret provider detail\"}}\n"))
	_, providerErr := processStream(providerBody, nil)
	require.EqualError(t, providerErr, "openrouter: provider returned a streaming error")
	require.ErrorIs(t, providerErr, ErrTransportOrProvider)
	require.NotContains(t, providerErr.Error(), "secret provider detail")

	streamErr := &failingReadCloser{err: errors.New("secret transport topology")}
	_, transportErr := processStream(streamErr, nil)
	require.EqualError(t, transportErr, "openrouter: stream read error")
	require.ErrorIs(t, transportErr, ErrTransportOrProvider)
	require.NotContains(t, transportErr.Error(), "secret transport topology")
}

func TestProcessStreamTypesAccessDenialWithoutExposingProviderDetail(t *testing.T) {
	for _, code := range []string{"401", `"402"`, "403"} {
		t.Run(code, func(t *testing.T) {
			body := io.NopCloser(strings.NewReader(`data: {"error":{"code":` + code + `,"message":"secret billing and account detail"}}` + "\n"))
			var delivered []string

			text, _, _, err := processStreamWithTelemetry(body, func(chunk string) {
				delivered = append(delivered, chunk)
			})

			require.Empty(t, text)
			require.Empty(t, delivered)
			require.EqualError(t, err, "openrouter: provider access denied")
			require.ErrorIs(t, err, ErrAccessDenied)
			require.NotContains(t, err.Error(), "billing")
			require.NotContains(t, err.Error(), "account")
		})
	}
}

type failingReadCloser struct {
	err error
}

func (r *failingReadCloser) Read([]byte) (int, error) {
	return 0, r.err
}

func (*failingReadCloser) Close() error {
	return nil
}

func TestProcessStreamStopsAtGeneratedResponseLimit(t *testing.T) {
	content := strings.Repeat("x", maxGeneratedResponseRunes+1)
	body := io.NopCloser(strings.NewReader(`data: {"choices":[{"delta":{"content":"` + content + `"}}]}` + "\n"))

	_, err := processStream(body, nil)

	require.EqualError(t, err, "openrouter: generated response exceeds size limit")
}

func TestProcessStreamRejectsEOFWithoutDoneSentinel(t *testing.T) {
	body := io.NopCloser(strings.NewReader(`data: {"choices":[{"delta":{"content":"partial"}}]}` + "\n"))

	text, err := processStream(body, nil)

	require.Equal(t, "partial", text)
	require.EqualError(t, err, "openrouter: provider response incomplete: stream ended before completion")
	require.ErrorIs(t, err, ErrProviderIncomplete)
}

func TestProcessStreamRejectsMalformedDataEvenWithDoneSentinel(t *testing.T) {
	body := io.NopCloser(strings.NewReader(
		`data: {"choices":[{"delta":{"content":"partial"}}]}` + "\n" +
			"data: not-json\n" +
			"data: [DONE]\n",
	))

	text, err := processStream(body, nil)

	require.Equal(t, "partial", text)
	require.EqualError(t, err, "openrouter: provider response incomplete: malformed streaming data")
	require.ErrorIs(t, err, ErrProviderIncomplete)
}

func TestProcessStreamCapturesSafeRoutingMetadata(t *testing.T) {
	body := io.NopCloser(strings.NewReader("data: {\"model\":\"nvidia/nemotron-3-nano-30b-a3b:free\",\"provider\":{\"slug\":\"nvidia\"},\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n" +
		"data: {\"model\":\"nvidia/nemotron-3-nano-30b-a3b:free\",\"provider\":\"nvidia\",\"choices\":[{\"delta\":{\"content\":\"there\"}}]}\n\n" +
		"data: [DONE]\n\n"))

	text, routing, err := processStreamWithMetadata(body, nil)

	require.NoError(t, err)
	require.Equal(t, "Hellothere", text)
	require.Equal(t, "nvidia/nemotron-3-nano-30b-a3b:free", routing.model)
	require.Equal(t, "nvidia", routing.provider)
}

func TestRoutingMetadataRejectsUnsafeValues(t *testing.T) {
	header := make(http.Header)
	header.Set("X-OpenRouter-Model", "trusted-model\nleaked-content")
	header.Set("X-OpenRouter-Provider", " provider with spaces ")

	fromHeaders := routingMetadataFromHeaders(header)
	fromChunk := routingMetadataFromChunk(streamChunk{
		Model:    "actual-model",
		Provider: json.RawMessage(`{"name":"unsafe provider\ntext","id":"safe-provider"}`),
	})

	require.Empty(t, fromHeaders.model)
	require.Empty(t, fromHeaders.provider)
	require.Equal(t, "actual-model", fromChunk.model)
	require.Equal(t, "safe-provider", fromChunk.provider)
}

func TestGenerateTelemetryIncludesHTTPRetriesBackoffAndProviderUsage(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) == 1 {
			w.Header().Set("Retry-After", "2")
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, err := io.WriteString(w,
			"data: {\"model\":\"actual/model\",\"choices\":[{\"delta\":{\"content\":\"answer\"}}]}\n\n"+
				"data: {\"usage\":{\"prompt_tokens\":11,\"completion_tokens\":7,\"completion_tokens_details\":{\"reasoning_tokens\":5},\"cost\":0.0125},\"choices\":[]}\n\n"+
				"data: [DONE]\n\n")
		require.NoError(t, err)
	}))
	defer server.Close()
	client := newClient("secret-key", "configured/model", server.URL, server.Client())
	var waited []time.Duration
	client.waitBeforeRetry = func(_ context.Context, delay time.Duration) error {
		waited = append(waited, delay)
		return nil
	}

	text, err := client.Generate(context.Background(), []Message{{Role: RoleUser, Content: "hello"}}, nil)

	require.NoError(t, err)
	require.Equal(t, "answer", text)
	require.Equal(t, []time.Duration{2 * time.Second}, waited)
	telemetry := client.TelemetrySnapshot()
	require.Equal(t, 2, telemetry.HTTPAttempts)
	require.Equal(t, 1, telemetry.HTTPFailures)
	require.Equal(t, 1, telemetry.RetryAttempts)
	require.Equal(t, 2*time.Second, telemetry.RetryBackoff)
	require.Positive(t, telemetry.TotalAttemptLatency)
	require.Equal(t, int64(11), telemetry.PromptTokens)
	require.Equal(t, int64(7), telemetry.CompletionTokens)
	require.Equal(t, int64(5), telemetry.ReasoningTokens, "hidden reasoning must still be counted from provider usage")
	require.Equal(t, 0.0125, telemetry.CostUSD)
	require.Equal(t, 1, telemetry.UsageSamples)
	require.Equal(t, 1, telemetry.CostSamples)
}

func TestProcessStreamIgnoresEmptyContentChunksBeforeText(t *testing.T) {
	chunks := make([]string, 0, 1)
	body := io.NopCloser(strings.NewReader(
		"data: {\"choices\":[{\"delta\":{\"content\":\"\"}}]}\n\n" +
			"data: {\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":1},\"choices\":[]}\n\n" +
			"data: {\"choices\":[{\"delta\":{\"content\":\"x\"}}]}\n\n" +
			"data: [DONE]\n\n"))

	text, _, telemetry, err := processStreamWithTelemetry(body, func(chunk string) {
		chunks = append(chunks, chunk)
	})

	require.NoError(t, err)
	require.Equal(t, "x", text)
	require.Equal(t, []string{"x"}, chunks)
	require.Equal(t, int64(3), telemetry.PromptTokens)
	require.Equal(t, int64(1), telemetry.CompletionTokens)
	require.Equal(t, 1, telemetry.UsageSamples)
}

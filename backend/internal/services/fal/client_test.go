package fal

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestClientSubmitUsesQueueAndPrivacyHeaders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/fal-ai/nano-banana-2", r.URL.Path)
		require.Equal(t, "Key secret-key", r.Header.Get("Authorization"))
		require.Equal(t, "0", r.Header.Get("X-Fal-Store-IO"))
		var payload map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		require.Equal(t, "portrait in a park", payload["prompt"])
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"request_id":"request-123"}`))
	}))
	defer server.Close()

	client := newClient("secret-key", server.URL, server.Client())
	requestID, err := client.Submit(context.Background(), "fal-ai/nano-banana-2", map[string]any{
		"prompt": "portrait in a park",
	})

	require.NoError(t, err)
	require.Equal(t, "request-123", requestID)
}

func TestClientRejectsUnsafeModelPath(t *testing.T) {
	client := newClient("secret-key", "https://queue.fal.run", http.DefaultClient)
	_, err := client.Submit(context.Background(), "../internal/metadata", map[string]any{"prompt": "x"})
	require.EqualError(t, err, "fal model id is invalid")
}

func TestClientStatusAndResult(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/fal-ai/nano-banana-2/requests/request-123/status":
			_, _ = w.Write([]byte(`{"status":"IN_PROGRESS","request_id":"request-123"}`))
		case "/fal-ai/nano-banana-2/requests/request-123/response":
			_, _ = w.Write([]byte(`{"images":[{"url":"https://v3.fal.media/files/a.png","content_type":"image/png","width":1024,"height":1024}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := newClient("secret-key", server.URL, server.Client())
	status, err := client.Status(context.Background(), "fal-ai/nano-banana-2", "request-123")
	require.NoError(t, err)
	require.Equal(t, StatusInProgress, status.Status)

	result, err := client.Result(context.Background(), "fal-ai/nano-banana-2", "request-123")
	require.NoError(t, err)
	require.Len(t, result.Images, 1)
	require.Equal(t, 1024, result.Images[0].Width)
	require.Equal(t, "https://v3.fal.media/files/a.png", result.Images[0].URL)
}

func TestClientDoesNotLeakProviderErrorBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"detail":"internal provider stack and secret"}`, http.StatusInternalServerError)
	}))
	defer server.Close()

	client := newClient("secret-key", server.URL, server.Client())
	_, err := client.Submit(context.Background(), "fal-ai/nano-banana-2", map[string]any{"prompt": "x"})
	require.Error(t, err)
	require.NotContains(t, err.Error(), "internal provider stack")
}

func TestClientRejectsOversizedSuccessfulResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"request_id":"request-123"}` + strings.Repeat(" ", maxJSONResponseBytes)))
	}))
	defer server.Close()

	_, err := newClient("secret-key", server.URL, server.Client()).Submit(
		context.Background(), "fal-ai/nano-banana-2", map[string]any{"prompt": "x"},
	)
	require.EqualError(t, err, "fal response exceeds size limit")
}

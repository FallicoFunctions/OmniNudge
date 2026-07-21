package openrouter

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"
)

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
}

func TestProcessStreamStopsAtGeneratedResponseLimit(t *testing.T) {
	content := strings.Repeat("x", maxGeneratedResponseRunes+1)
	body := io.NopCloser(strings.NewReader(`data: {"choices":[{"delta":{"content":"` + content + `"}}]}` + "\n"))

	_, err := processStream(body, nil)

	require.EqualError(t, err, "openrouter: generated response exceeds size limit")
}

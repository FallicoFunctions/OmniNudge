package tavus

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestClientCreatesPrivateRealtimeConversationAndEndsIt(t *testing.T) {
	var ended bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "server-secret", r.Header.Get("x-api-key"))
		switch r.URL.Path {
		case "/v2/conversations":
			require.Equal(t, http.MethodPost, r.Method)
			var request CreateConversationRequest
			require.NoError(t, json.NewDecoder(r.Body).Decode(&request))
			require.True(t, request.RequireAuth)
			require.False(t, request.AudioOnly)
			require.Equal(t, 2, request.MaxParticipants)
			require.Equal(t, "replica-1", request.ReplicaID)
			require.Equal(t, "persona-1", request.PersonaID)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"conversation_id":"call-1","conversation_url":"https://room.daily.co/call-1","meeting_token":"token-value","status":"active"}`))
		case "/v2/conversations/call-1/end":
			require.Equal(t, http.MethodPost, r.Method)
			ended = true
			w.WriteHeader(http.StatusOK)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewClient("server-secret", server.URL)
	created, err := client.CreateConversation(context.Background(), CreateConversationRequest{
		ReplicaID: "replica-1", PersonaID: "persona-1", ConversationName: "Sadie call",
		ConversationalContext: "Continue the private OmniChat conversation.",
	})
	require.NoError(t, err)
	require.Equal(t, "call-1", created.ConversationID)
	require.Equal(t, "https://room.daily.co/call-1?t=token-value", created.JoinURL)
	require.NoError(t, client.EndConversation(context.Background(), created.ConversationID))
	require.True(t, ended)
}

func TestClientRejectsUntrustedMeetingURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"conversation_id":"call-1","conversation_url":"https://evil.example/call-1","meeting_token":"token-value","status":"active"}`))
	}))
	defer server.Close()

	_, err := NewClient("key", server.URL).CreateConversation(context.Background(), CreateConversationRequest{
		ReplicaID: "replica-1", PersonaID: "persona-1",
	})
	require.Error(t, err)
	require.NotContains(t, err.Error(), "token-value")
}

func TestClientTreatsAlreadyEndedConversationAsSuccessfulCleanup(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusGone)
	}))
	defer server.Close()

	require.NoError(t, NewClient("key", server.URL).EndConversation(context.Background(), "call-1"))
}

func TestClientRejectsOversizedSuccessfulResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"conversation_id":"call-1","conversation_url":"https://room.daily.co/call-1","meeting_token":"token","status":"active"}` + strings.Repeat(" ", maxJSONResponseBytes)))
	}))
	defer server.Close()

	_, err := NewClient("key", server.URL).CreateConversation(context.Background(), CreateConversationRequest{
		ReplicaID: "replica-1", PersonaID: "persona-1",
	})
	require.EqualError(t, err, "live avatar provider response exceeds size limit")
}

func TestClientDoesNotFollowCrossHostRedirectWithCredential(t *testing.T) {
	var targetRequests atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		targetRequests.Add(1)
		require.Empty(t, r.Header.Get("x-api-key"))
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer origin.Close()

	_, err := NewClient("server-secret", origin.URL).CreateConversation(context.Background(), CreateConversationRequest{
		ReplicaID: "replica-1", PersonaID: "persona-1",
	})

	require.Error(t, err)
	require.Zero(t, targetRequests.Load())
}

func TestClientRejectsCredentialBearingBaseURL(t *testing.T) {
	_, err := NewClient("server-secret", "https://attacker@tavusapi.com").CreateConversation(context.Background(), CreateConversationRequest{
		ReplicaID: "replica-1", PersonaID: "persona-1",
	})
	require.EqualError(t, err, "invalid live avatar provider URL")
}

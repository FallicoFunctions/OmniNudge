package elevenlabs

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestClientSynthesizeUsesServerCredentialAndBoundedAudioResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/text-to-speech/voice-123", r.URL.Path)
		require.Equal(t, "false", r.URL.Query().Get("enable_logging"))
		require.Equal(t, "secret-key", r.Header.Get("xi-api-key"))
		require.Equal(t, "application/json", r.Header.Get("Content-Type"))
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.Contains(t, string(body), `"text":"Hello Sadie"`)
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte{'I', 'D', '3', 4, 0, 0, 0})
	}))
	defer server.Close()

	client := NewClient("secret-key", server.URL, false)
	audio, contentType, err := client.Synthesize(context.Background(), "voice-123", SpeechRequest{Text: "Hello Sadie", ModelID: "eleven_multilingual_v2"})
	require.NoError(t, err)
	require.Equal(t, "audio/mpeg", contentType)
	require.Equal(t, []byte{'I', 'D', '3'}, audio[:3])
}

func TestClientSynthesizeRejectsNonAudioProviderResponses(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"detail":"secret provider detail"}`))
	}))
	defer server.Close()

	_, _, err := NewClient("key", server.URL, false).Synthesize(context.Background(), "voice", SpeechRequest{Text: "Hello"})
	require.Error(t, err)
	require.NotContains(t, err.Error(), "secret provider detail")
}

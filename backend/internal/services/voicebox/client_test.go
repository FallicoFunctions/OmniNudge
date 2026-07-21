package voicebox

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/omninudge/backend/internal/services/speech"
	"github.com/stretchr/testify/require"
)

func TestNewClientRejectsNonLoopbackHTTPURL(t *testing.T) {
	_, err := NewClient("http://voicebox.example.com:17493", 0)
	require.Error(t, err)
}

func TestClientResolvesPresetProfileAndGeneratesBoundedWAV(t *testing.T) {
	var profileCreates atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/profiles":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[]`))
		case r.Method == http.MethodPost && r.URL.Path == "/profiles":
			profileCreates.Add(1)
			var body map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			require.Equal(t, "preset", body["voice_type"])
			require.Equal(t, "kokoro", body["preset_engine"])
			require.Equal(t, "af_heart", body["preset_voice_id"])
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"d4dd8514-4ab5-47b2-87bd-e474f3a4ce0a","name":"OmniChat Heart","description":null,"language":"en","voice_type":"preset","preset_engine":"kokoro","preset_voice_id":"af_heart","generation_count":0,"sample_count":0,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"}`))
		case r.Method == http.MethodPost && r.URL.Path == "/generate/stream":
			var body map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			require.Equal(t, "d4dd8514-4ab5-47b2-87bd-e474f3a4ce0a", body["profile_id"])
			require.Equal(t, "kokoro", body["engine"])
			w.Header().Set("Content-Type", "audio/wav")
			_, _ = w.Write(append([]byte("RIFF\x24\x00\x00\x00WAVE"), make([]byte, 32)...))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, err := newClient(server.URL, 0, true)
	require.NoError(t, err)
	audio, err := client.Synthesize(context.Background(), "af_heart", speech.Request{
		Text: "Hello", VoiceName: "Heart", ModelID: "kokoro", LanguageCode: "en",
	})
	require.NoError(t, err)
	require.Equal(t, "audio/wav", audio.ContentType)
	require.Equal(t, ".wav", audio.Extension)
	require.Equal(t, int32(1), profileCreates.Load())
}

func TestClientRejectsHTMLDisguisedAsAudio(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/profiles" {
			_, _ = w.Write([]byte(`[{"id":"d4dd8514-4ab5-47b2-87bd-e474f3a4ce0a","name":"Heart","language":"en","voice_type":"preset","preset_engine":"kokoro","preset_voice_id":"af_heart","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"}]`))
			return
		}
		w.Header().Set("Content-Type", "audio/wav")
		_, _ = w.Write([]byte("<html>not audio</html>"))
	}))
	defer server.Close()

	client, err := newClient(server.URL, 0, true)
	require.NoError(t, err)
	_, err = client.Synthesize(context.Background(), "af_heart", speech.Request{Text: "Hello", ModelID: "kokoro"})
	require.Error(t, err)
}

func TestClientDoesNotFollowVoiceboxRedirects(t *testing.T) {
	var redirectedRequests atomic.Int32
	redirectTarget := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		redirectedRequests.Add(1)
	}))
	defer redirectTarget.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/profiles" {
			_, _ = w.Write([]byte(`[{"id":"d4dd8514-4ab5-47b2-87bd-e474f3a4ce0a","name":"Heart","language":"en","voice_type":"preset","preset_engine":"kokoro","preset_voice_id":"af_heart","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"}]`))
			return
		}
		http.Redirect(w, r, redirectTarget.URL, http.StatusTemporaryRedirect)
	}))
	defer server.Close()

	client, err := newClient(server.URL, 0, true)
	require.NoError(t, err)
	_, err = client.Synthesize(context.Background(), "af_heart", speech.Request{Text: "Hello", ModelID: "kokoro"})
	require.Error(t, err)
	require.Zero(t, redirectedRequests.Load())
}

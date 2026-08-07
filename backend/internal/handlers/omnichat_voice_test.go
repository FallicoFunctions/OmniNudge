package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/speech"
	"github.com/stretchr/testify/require"
)

type voicePreviewFake struct{}

func (*voicePreviewFake) GetOrCreateSpeech(context.Context, int, int, int) (*models.OmniChatSpeechAudio, error) {
	return nil, nil
}

func (*voicePreviewFake) PreviewPresetSpeech(_ context.Context, preset services.OmniChatVoicePreset) (*speech.Audio, error) {
	return &speech.Audio{Bytes: append([]byte("RIFF\x24\x00\x00\x00WAVE"), make([]byte, 32)...), ContentType: "audio/wav", Extension: ".wav"}, nil
}

func TestNormalizeOmniChatVoiceProfileRejectsInvalidBoundedFields(t *testing.T) {
	invalidLanguage := "english-US"
	voice := &models.OmniChatPersonaVoice{
		Provider: "elevenlabs", VoiceID: "voice_1", VoiceName: "Sadie",
		ModelID: "eleven_multilingual_v2", Stability: .5, SimilarityBoost: .75,
		Speed: 1, Pitch: 1, LanguageCode: &invalidLanguage,
	}
	require.Error(t, normalizeOmniChatVoiceProfile(voice))

	validLanguage := "en-US"
	voice.LanguageCode = &validLanguage
	require.NoError(t, normalizeOmniChatVoiceProfile(voice))

}

func TestPublicOmniChatVoiceProfileContainsOnlySpeechConfiguration(t *testing.T) {
	voice := &models.OmniChatPersonaVoice{
		PersonaID: 42, Provider: "elevenlabs", VoiceID: "voice_42", VoiceName: "Sadie",
		ModelID: "eleven_multilingual_v2", Speed: 1, Pitch: 1,
	}
	encoded, err := json.Marshal(publicOmniChatVoiceProfile(voice))
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "provider_session")
}

func TestNormalizeOmniChatVoiceProfileAcceptsCuratedVoiceboxPreset(t *testing.T) {
	language := "en"
	voice := &models.OmniChatPersonaVoice{
		Provider: "voicebox", VoiceID: "af_heart", VoiceName: "Heart",
		ModelID: "kokoro", Stability: .5, SimilarityBoost: .75,
		Speed: 1, Pitch: 1, LanguageCode: &language,
	}

	require.NoError(t, normalizeOmniChatVoiceProfile(voice))

	voice.VoiceID = "af_unknown"
	require.Error(t, normalizeOmniChatVoiceProfile(voice))
}

func TestOmniChatVoiceHandlerListsTwelveServerOwnedPresets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewOmniChatVoiceHandler(nil, nil, nil, nil, "", "").ConfigureVoiceCatalog(true, false)
	router := gin.New()
	router.GET("/voice-presets", handler.ListVoicePresets)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/voice-presets", nil))

	require.Equal(t, http.StatusOK, response.Code)
	var body struct {
		Presets             []services.OmniChatVoicePreset `json:"presets"`
		VoiceboxAvailable   bool                           `json:"voicebox_available"`
		VoiceCloningEnabled bool                           `json:"voice_cloning_enabled"`
	}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
	require.Len(t, body.Presets, 12)
	require.True(t, body.VoiceboxAvailable)
	require.False(t, body.VoiceCloningEnabled)
}

func TestOmniChatVoiceHandlerStreamsOnlyKnownPresetPreview(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewOmniChatVoiceHandler(nil, &voicePreviewFake{}, nil, nil, "", "").ConfigureVoiceCatalog(true, false)
	router := gin.New()
	router.POST("/voice-presets/:preset_id/preview", handler.PreviewVoicePreset)

	valid := httptest.NewRecorder()
	router.ServeHTTP(valid, httptest.NewRequest(http.MethodPost, "/voice-presets/af_heart/preview", nil))
	require.Equal(t, http.StatusOK, valid.Code)
	require.Equal(t, "audio/wav", valid.Header().Get("Content-Type"))

	unknown := httptest.NewRecorder()
	router.ServeHTTP(unknown, httptest.NewRequest(http.MethodPost, "/voice-presets/af_unknown/preview", nil))
	require.Equal(t, http.StatusNotFound, unknown.Code)
}

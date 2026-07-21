package handlers

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

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

	replicaID, personaID := "replica_42", "persona_42"
	voice.LiveVideoReplicaID = &replicaID
	voice.LiveVideoPersonaID = &personaID
	require.NoError(t, normalizeOmniChatVoiceProfile(voice))
	voice.LiveVideoPersonaID = nil
	require.Error(t, normalizeOmniChatVoiceProfile(voice))
}

func TestPublicOmniChatVoiceProfileOmitsLiveProviderConfiguration(t *testing.T) {
	replicaID, personaID := "replica_42", "persona_42"
	voice := &models.OmniChatPersonaVoice{
		PersonaID: 42, Provider: "elevenlabs", VoiceID: "voice_42", VoiceName: "Sadie",
		ModelID: "eleven_multilingual_v2", Speed: 1, Pitch: 1,
		LiveVideoReplicaID: &replicaID, LiveVideoPersonaID: &personaID,
	}
	encoded, err := json.Marshal(publicOmniChatVoiceProfile(voice))
	require.NoError(t, err)
	require.False(t, strings.Contains(string(encoded), "live_video_replica_id"))
	require.False(t, strings.Contains(string(encoded), "live_video_persona_id"))
	require.NotNil(t, voice.LiveVideoReplicaID, "sanitizing a response must not mutate the repository object")
}

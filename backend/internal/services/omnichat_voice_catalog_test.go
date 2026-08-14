package services

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOmniChatVoicePresetsContainSixFemaleAndSixMaleVoices(t *testing.T) {
	presets := OmniChatVoicePresets()
	require.Len(t, presets, 12)

	counts := map[string]int{}
	ids := map[string]struct{}{}
	for _, preset := range presets {
		counts[preset.Gender]++
		_, duplicate := ids[preset.ID]
		require.False(t, duplicate)
		ids[preset.ID] = struct{}{}
		require.Equal(t, "voicebox", preset.Provider)
		require.Equal(t, "kokoro", preset.ModelID)
		require.Equal(t, "en", preset.LanguageCode)
	}
	require.Equal(t, 6, counts["female"])
	require.Equal(t, 6, counts["male"])
}

func TestFindOmniChatVoicePresetDoesNotAcceptUnknownProviderVoice(t *testing.T) {
	_, ok := FindOmniChatVoicePreset("af_unknown")
	require.False(t, ok)
}

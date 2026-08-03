package models

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDefaultBrowserVoiceIsStableAndCharacterSpecific(t *testing.T) {
	first := defaultBrowserVoice(101)
	again := defaultBrowserVoice(101)
	second := defaultBrowserVoice(109)

	require.Equal(t, first, again)
	require.Equal(t, "browser-101", first.VoiceID)
	require.NotEqual(t, first.VoiceID, second.VoiceID)
	require.True(t, first.Speed != second.Speed || first.Pitch != second.Pitch)
}

func TestDefaultBrowserVoiceKeepsUnexpectedIDsInSafeRanges(t *testing.T) {
	for _, personaID := range []int{-1, 0, 1} {
		voice := DefaultOmniChatBrowserVoice(personaID)
		require.GreaterOrEqual(t, voice.Speed, float32(0.85))
		require.LessOrEqual(t, voice.Speed, float32(1.15))
		require.GreaterOrEqual(t, voice.Pitch, float32(0.75))
		require.LessOrEqual(t, voice.Pitch, float32(1.45))
	}
}

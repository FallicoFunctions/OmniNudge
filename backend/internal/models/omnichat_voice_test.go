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

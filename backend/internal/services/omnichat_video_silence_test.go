package services_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// The four prompts that actually produced a talking clip, plus the one that
// did not. These are not invented cases: each left side was sent to Veo and
// the result watched.
func TestSilentMotionRemovesTheAudience(t *testing.T) {
	for _, tc := range []struct {
		name   string
		motion string
	}{
		{"talks and smiles", "she talks and smiles, gesturing lightly with one hand"},
		{"waves at the camera", "She smiles at the camera and gives a small wave, then lowers her hand"},
		{"speaking to viewer", "she is speaking to the camera about her day"},
		{"greets you", "she greets you warmly"},
		{"tells a story", "she tells a story, laughing"},
		{"looks into the lens", "she looks into the lens and smiles"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := services.SilentMotion(tc.motion)

			require.True(t, services.MotionImpliesSpeech(tc.motion),
				"the fixture must be one that would have produced speech")
			require.False(t, services.MotionImpliesSpeech(got),
				"the rewrite still points her at an audience: %q", got)
		})
	}
}

// The prompt that worked. It must survive untouched -- a guard that rewrites
// good input is a guard people route around.
func TestSilentMotionLeavesAPhysicalActionAlone(t *testing.T) {
	for _, motion := range []string{
		"she takes a record from the shelf beside her, holds it in both hands, and looks down at the cover",
		"she shifts her weight and tucks her hair behind her ear",
		"she picks up a mug and blows on it",
		"she stretches and rolls her shoulders",
	} {
		require.Equal(t, motion, services.SilentMotion(motion), motion)
	}
}

// Removing the speaking clause must not take the rest of the sentence with it.
func TestSilentMotionKeepsTheClausesThatAreNotSpeech(t *testing.T) {
	got := services.SilentMotion("she holds a mug in both hands, talking to him, and leans on the counter")

	require.Contains(t, got, "holds a mug in both hands")
	require.Contains(t, got, "leans on the counter")
	require.NotContains(t, got, "talking")
}

// A motion that was nothing but speech leaves nothing. Returning empty would
// animate nothing and still charge for the render, so it falls back.
func TestSilentMotionFallsBackRatherThanReturningNothing(t *testing.T) {
	for _, motion := range []string{
		"she talks",
		"talking to the camera",
		"",
		"   ",
		"she says hello",
	} {
		got := services.SilentMotion(motion)

		require.NotEmpty(t, got, motion)
		require.False(t, services.MotionImpliesSpeech(got), got)
		require.Greater(t, len(strings.Fields(got)), 2, got)
	}
}

// Word boundaries, both sides. A blind pattern on this repository once failed
// because it could not match a one-letter word; the mirror of that mistake is
// a pattern that matches inside a longer one.
func TestSilentMotionDoesNotMatchInsideOtherWords(t *testing.T) {
	for _, motion := range []string{
		"she stalks across the room",
		"she walks past the counter",
		"she asks the shelf for nothing", // "asks" is speech and must go
	} {
		got := services.SilentMotion(motion)
		if strings.Contains(motion, "asks") {
			require.NotContains(t, got, "asks")
			continue
		}
		require.Equal(t, motion, got, "a word merely containing a speech verb must survive: %q", motion)
	}
}

// The rule has to reach every video mode, not only the one somebody remembered.
// Gating the scaffolding on contextual alone is exactly the defect that let a
// Create-screen clip drift and cut mid-gesture for a month.
func TestBuiltVideoPromptNeverAsksHerToSpeak(t *testing.T) {
	scene := models.OmniChatSceneState{Activity: "talking to him about her day"}
	for _, mode := range []models.OmniChatGenerationMode{
		models.OmniChatGenerationModeContextual,
		models.OmniChatGenerationModeCreate,
		models.OmniChatGenerationModeImageToVideo,
	} {
		got := services.BuildOmniChatVideoMotionPrompt(mode, "she talks at the camera", scene)

		require.NotEmpty(t, got, string(mode))
		require.NotContains(t, strings.ToLower(got), "talk", string(mode))
		require.NotContains(t, strings.ToLower(got), "at the camera", string(mode))
	}
}

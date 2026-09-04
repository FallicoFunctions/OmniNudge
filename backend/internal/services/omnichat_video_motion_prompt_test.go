package services_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// Every video mode drifts for the same reasons. For a month only the scene
// clip was told not to: create and image_to_video returned the caller's bare
// words, so a clip animated from the Create screen had no static-camera line,
// no identity-hold line and no arc, and it wandered and stopped mid-gesture.
func TestVideoMotionPromptScaffoldsEveryMode(t *testing.T) {
	scene := models.OmniChatSceneState{Activity: "laughing at something off camera"}
	for _, mode := range []models.OmniChatGenerationMode{
		models.OmniChatGenerationModeContextual,
		models.OmniChatGenerationModeCreate,
		models.OmniChatGenerationModeImageToVideo,
	} {
		got := services.BuildOmniChatVideoMotionPrompt(mode, "she waves with both hands", scene)

		require.Contains(t, got, "Static camera", string(mode))
		require.Contains(t, got, "the phone is propped up and does not move", string(mode))
		require.Contains(t, got, "add only motion", string(mode))
		require.Contains(t, got, "comes to rest before the clip ends", string(mode))
		require.Contains(t, got, "Motion: ", string(mode))
	}
}

// The scene supplies the motion for a contextual clip; the caller's own words
// supply it everywhere else.
func TestVideoMotionPromptTakesItsMotionFromTheRightPlace(t *testing.T) {
	scene := models.OmniChatSceneState{Activity: "pouring a cup of tea"}

	contextual := services.BuildOmniChatVideoMotionPrompt(
		models.OmniChatGenerationModeContextual, "she waves", scene)
	require.Contains(t, contextual, "Motion: pouring a cup of tea.")
	require.NotContains(t, contextual, "she waves")

	direct := services.BuildOmniChatVideoMotionPrompt(
		models.OmniChatGenerationModeImageToVideo, "she waves", scene)
	require.Contains(t, direct, "Motion: she waves.")
	require.NotContains(t, direct, "pouring a cup of tea")
}

// An empty return is how the caller refuses a job with no motion to animate.
// Scaffolding alone would animate nothing and charge for it.
//
// Contextual is the exception and must stay one: its prompt is fixed
// boilerplate that is dropped on purpose, so a scene carrying no activity
// still animates on the hold and arc lines alone. Making this symmetric would
// refuse every activity-less Scene video -- a regression this test caught
// while it was being written.
func TestVideoMotionPromptIsEmptyOnlyWhenTheCallerSuppliesTheMotion(t *testing.T) {
	require.Empty(t, services.BuildOmniChatVideoMotionPrompt(
		models.OmniChatGenerationModeImageToVideo, "   ", models.OmniChatSceneState{}))
	require.Empty(t, services.BuildOmniChatVideoMotionPrompt(
		models.OmniChatGenerationModeCreate, "", models.OmniChatSceneState{}))

	contextual := services.BuildOmniChatVideoMotionPrompt(
		models.OmniChatGenerationModeContextual, "she waves", models.OmniChatSceneState{})
	require.Contains(t, contextual, "Animate the supplied still image.")
	require.Contains(t, contextual, "comes to rest before the clip ends")
	require.NotContains(t, contextual, "Motion: ")
}

func TestVideoMotionPromptDoesNotDoubleThePeriod(t *testing.T) {
	got := services.BuildOmniChatVideoMotionPrompt(
		models.OmniChatGenerationModeImageToVideo, "she waves.", models.OmniChatSceneState{})

	require.Contains(t, got, "Motion: she waves.")
	require.False(t, strings.Contains(got, ".."), got)
}

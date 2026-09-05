package queue

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/models"
)

func hostedVideoConfig() config.OmniChatMediaConfig {
	cfg := omniChatMediaTestConfig()
	cfg.VideoProvider = OmniChatVideoProviderOpenRouter
	cfg.VideoModel = "minimax/hailuo-3"
	cfg.VideoResolution = "2K"
	cfg.VideoAspectRatio = "9:16"
	return cfg
}

func hostedVideoJob() *models.OmniChatGenerationJob {
	return &models.OmniChatGenerationJob{
		ID:              uuid.MustParse("11111111-2222-3333-4444-555555555555"),
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeImageToVideo,
		Prompt:          "she takes a record from the shelf and looks at the cover",
		DurationSeconds: 6,
	}
}

// Every key the adapter reads must be one the builder writes. The spec Input is
// a map, so a typo on either side is a silently dropped parameter -- which is
// how model_id ended up declared, decoded by nothing and stored nowhere for a
// month. This is the same check as the runpod Result wiring test, one level up.
func TestOpenRouterVideoSpecWritesEveryKeyTheAdapterReads(t *testing.T) {
	spec, err := BuildOpenRouterVideoSpec(hostedVideoConfig(), hostedVideoJob(),
		"https://signed.example.test/still.png")

	require.NoError(t, err)
	for _, key := range OpenRouterVideoInputKeys {
		value, present := spec.Input[key]
		require.Truef(t, present, "the builder never writes %q, which the adapter reads", key)
		require.NotNilf(t, value, "%q is present but nil", key)
	}
	require.Len(t, spec.Input, len(OpenRouterVideoInputKeys),
		"the builder writes a key nothing reads: %v", spec.Input)
}

func TestOpenRouterVideoSpecCarriesTheModelAndTheStill(t *testing.T) {
	spec, err := BuildOpenRouterVideoSpec(hostedVideoConfig(), hostedVideoJob(),
		"https://signed.example.test/still.png")

	require.NoError(t, err)
	require.Equal(t, "minimax/hailuo-3", spec.EndpointID)
	require.Equal(t, "https://signed.example.test/still.png", spec.Input[videoInputFirstFrame])
	require.Equal(t, "2K", spec.Input[videoInputResolution])
	require.Equal(t, "9:16", spec.Input[videoInputAspectRatio])
	require.Equal(t, 6, spec.Input[videoInputDuration])
	require.Equal(t, seedForJob(hostedVideoJob().ID), spec.Input[videoInputSeed])
}

// The rules learned on the self-hosted path have to survive the move. The
// motion must carry no audience -- that is the only thing that ever stopped
// her appearing to speak, and a hosted model is not exempt from it.
func TestOpenRouterVideoSpecPromptNeverAsksHerToSpeak(t *testing.T) {
	job := hostedVideoJob()
	job.Prompt = "she talks at the camera about her day"

	spec, err := BuildOpenRouterVideoSpec(hostedVideoConfig(), job, "https://signed.example.test/s.png")

	require.NoError(t, err)
	prompt, _ := spec.Input[videoInputPrompt].(string)
	require.NotContains(t, prompt, "talk")
	require.NotContains(t, prompt, "at the camera")
	require.Contains(t, prompt, "Static camera")
}

func TestOpenRouterVideoSpecRefusesWhatCannotSucceed(t *testing.T) {
	_, err := BuildOpenRouterVideoSpec(hostedVideoConfig(), nil, "https://x/s.png")
	require.ErrorContains(t, err, "generation job is required")

	_, err = BuildOpenRouterVideoSpec(hostedVideoConfig(), hostedVideoJob(), "   ")
	require.ErrorContains(t, err, "source is unavailable")

	_, err = BuildOpenRouterVideoSpec(hostedVideoConfig(), hostedVideoJob(), "http://insecure.test/s.png")
	require.ErrorContains(t, err, "source image URL is invalid")

	noModel := hostedVideoConfig()
	noModel.VideoModel = ""
	_, err = BuildOpenRouterVideoSpec(noModel, hostedVideoJob(), "https://x.test/s.png")
	require.ErrorContains(t, err, "video model")
}

// The switch that decides which provider animates a clip. Defaulting wrong in
// either direction is expensive: to RunPod is ten minutes a clip, to OpenRouter
// is money spent without anyone choosing to.
func TestUsesHostedVideoReadsTheConfiguredProvider(t *testing.T) {
	cfg := omniChatMediaTestConfig()
	for _, provider := range []string{"openrouter", "OpenRouter", "  openrouter  "} {
		cfg.VideoProvider = provider
		require.Truef(t, UsesHostedVideo(cfg), "%q must select the hosted path", provider)
	}
	for _, provider := range []string{"runpod", "", "RUNPOD", "openrouter-v2"} {
		cfg.VideoProvider = provider
		require.Falsef(t, UsesHostedVideo(cfg), "%q must not select the hosted path", provider)
	}
}

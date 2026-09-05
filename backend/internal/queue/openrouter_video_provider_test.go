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
	require.Equal(t, openRouterSafeSeed(seedForJob(hostedVideoJob().ID)), spec.Input[videoInputSeed])
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

// The defect that failed the first real job while every probe passed.
// seedForJob returns up to 2^63-1; OpenRouter rejects anything above 2^53-1
// with a 400. The probes were run with a small hand-picked seed and could not
// have caught it.
func TestOpenRouterVideoSeedFitsWhatTheProviderAccepts(t *testing.T) {
	for _, seed := range []int64{
		0, 1, openRouterMaxSeed, openRouterMaxSeed + 1,
		1 << 62, (1 << 63) - 1, -1, -(1 << 62),
	} {
		got := openRouterSafeSeed(seed)

		require.GreaterOrEqualf(t, got, int64(0), "seed %d became negative", seed)
		require.LessOrEqualf(t, got, openRouterMaxSeed,
			"seed %d stayed above the safe integer range and would be a 400", seed)
	}
}

// Masked, not clamped. Clamping maps every large seed onto one value, which is
// one picture charged for many times.
func TestOpenRouterVideoSeedKeepsDistinctJobsDistinct(t *testing.T) {
	first := openRouterSafeSeed(seedForJob(uuid.MustParse("11111111-2222-3333-4444-555555555555")))
	second := openRouterSafeSeed(seedForJob(uuid.MustParse("99999999-8888-7777-6666-555555555555")))

	require.NotEqual(t, first, second)
	require.NotEqual(t, openRouterSafeSeed(1<<62), openRouterSafeSeed((1<<63)-1))
}

// The spec must carry the bounded seed, not the raw one. Bounding it in a
// helper nobody calls is the defect this whole file exists to prevent.
func TestOpenRouterVideoSpecCarriesTheBoundedSeed(t *testing.T) {
	job := hostedVideoJob()

	spec, err := BuildOpenRouterVideoSpec(hostedVideoConfig(), job, "https://x.test/s.png")

	require.NoError(t, err)
	seed, ok := spec.Input[videoInputSeed].(int64)
	require.True(t, ok, "seed must be an int64: %T", spec.Input[videoInputSeed])
	require.LessOrEqual(t, seed, openRouterMaxSeed)
	require.Equal(t, openRouterSafeSeed(seedForJob(job.ID)), seed)
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

package queue

import (
	"context"
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

// countingCanceller records who was asked to cancel what.
type countingCanceller struct {
	runPodGenerationClient
	cancels []string
}

func (c *countingCanceller) Cancel(_ context.Context, endpointID, jobID string) error {
	c.cancels = append(c.cancels, endpointID+"/"+jobID)
	return nil
}

// Cancelling a hosted clip must not reach the self-hosted client. It would send
// a hosted model id to RunPod as an endpoint -- a call to the wrong service
// that logs a failed cancel while the real job keeps running and keeps billing.
func TestCancelGoesToTheProviderHoldingTheJob(t *testing.T) {
	image := &countingCanceller{}
	video := &countingCanceller{}
	handler := &OmniChatGenerationHandler{provider: image, videoProvider: video}

	handler.cancelSubmittedGeneration(t.Context(), video, uuid.New(), "minimax/hailuo-3", "job-1")

	require.Empty(t, image.cancels, "the self-hosted client must not be asked to cancel a hosted clip")
	require.Equal(t, []string{"minimax/hailuo-3/job-1"}, video.cancels)
}

// A nil client still has to cancel something rather than panic: the path that
// passes nil is the one that runs before any phase exists.
func TestCancelFallsBackToTheDefaultProvider(t *testing.T) {
	image := &countingCanceller{}
	handler := &OmniChatGenerationHandler{provider: image}

	handler.cancelSubmittedGeneration(t.Context(), nil, uuid.New(), "endpoint-image", "job-2")

	require.Equal(t, []string{"endpoint-image/job-2"}, image.cancels)
}

// The round trip: what the builder wrote, read back through the adapter.
//
// The key test proves every key is present and the builder's types are right.
// It says nothing about the reads, and the reads are type assertions on an
// untyped map -- so changing intField to assert int64 turned every clip's
// duration into zero and the whole queue suite still passed. Found by mutating
// the accessor rather than the field.
func TestVideoRequestFromInputReadsEveryFieldTheBuilderWrote(t *testing.T) {
	job := hostedVideoJob()
	spec, err := BuildOpenRouterVideoSpec(hostedVideoConfig(), job, "https://signed.example.test/still.png")
	require.NoError(t, err)

	request := VideoRequestFromInput(spec.EndpointID, spec.Input)

	require.Equal(t, "minimax/hailuo-3", request.Model)
	require.Equal(t, spec.Input[videoInputPrompt], request.Prompt)
	require.Equal(t, spec.Input[videoInputDuration], request.Duration,
		"duration was read back as zero: the adapter's type assertion no longer matches what the builder writes")
	require.Equal(t, spec.Input[videoInputResolution], request.Resolution)
	require.Equal(t, spec.Input[videoInputAspectRatio], request.AspectRatio)
	require.NotNil(t, request.Seed)
	require.Equal(t, spec.Input[videoInputSeed], *request.Seed)
	require.Len(t, request.FrameImages, 1)
	require.Equal(t, spec.Input[videoInputFirstFrame], request.FrameImages[0].URL)
	require.Equal(t, "first_frame", request.FrameImages[0].FrameType)

	// Nothing the builder wrote may read back as a zero value. A silent zero is
	// the failure this whole file guards: an absent duration becomes the
	// provider's own default, and nobody sees a defect until the clip is the
	// wrong length.
	require.NotZero(t, request.Duration)
	require.NotEmpty(t, request.Resolution)
	require.NotEmpty(t, request.AspectRatio)
	require.NotEmpty(t, request.Prompt)
}

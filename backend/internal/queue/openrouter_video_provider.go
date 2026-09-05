package queue

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/omninudge/backend/internal/services/runpod"
)

// OpenRouterVideoProvider animates stills through OpenRouter, wearing the same
// interface as the RunPod client so the generation handler does not know which
// one it is talking to.
//
// It exists because the self-hosted path takes about 580 seconds for a
// six-second clip and cannot reach the quality users are being charged for.
// The adapter shape rather than a second code path is deliberate: the handler
// owns the two-phase state machine, the billing, the refunds and the retry
// rules, and none of that should be duplicated for a second provider.
type OpenRouterVideoProvider struct {
	client *openrouter.Client
}

func NewOpenRouterVideoProvider(client *openrouter.Client) *OpenRouterVideoProvider {
	return &OpenRouterVideoProvider{client: client}
}

// The keys BuildOpenRouterVideoSpec writes and this adapter reads. Named
// constants in one place because a spec Input is a map: a typo on either side
// is a silently dropped parameter, which is how model_id ended up declared and
// stored nowhere for a month. OpenRouterVideoInputKeys is exported so a test
// can assert the builder writes every key the adapter looks for.
const (
	videoInputPrompt      = "prompt"
	videoInputDuration    = "duration_seconds"
	videoInputResolution  = "resolution"
	videoInputAspectRatio = "aspect_ratio"
	videoInputSeed        = "seed"
	videoInputFirstFrame  = "first_frame_url"
)

// OpenRouterVideoInputKeys is every key the adapter reads out of a spec.
var OpenRouterVideoInputKeys = []string{
	videoInputPrompt, videoInputDuration, videoInputResolution,
	videoInputAspectRatio, videoInputSeed, videoInputFirstFrame,
}

// Submit queues one clip. endpointID carries the model id: the handler's
// interface calls it an endpoint because RunPod does, and renaming it would
// touch every call site for no gain.
func (p *OpenRouterVideoProvider) Submit(ctx context.Context, endpointID string, input any) (string, error) {
	if p == nil || p.client == nil {
		return "", runpod.ErrNotConfigured
	}
	fields, ok := input.(map[string]any)
	if !ok {
		return "", fmt.Errorf("openrouter video: unexpected input %T", input)
	}
	job, err := p.client.SubmitVideo(ctx, VideoRequestFromInput(endpointID, fields))
	if err != nil {
		return "", translateOpenRouterVideoError(err)
	}
	return job.ID, nil
}

// VideoRequestFromInput is the map the spec carries turned into the request the
// provider receives.
//
// Exported and pure so the mapping itself can be read. Every key check in this
// package proves a key is present; only this proves it lands in the right
// field, and a resolution swapped with an aspect ratio would satisfy the
// former while producing a differently shaped clip.
func VideoRequestFromInput(model string, fields map[string]any) openrouter.VideoRequest {
	frames := []openrouter.FrameImage{}
	if url := strings.TrimSpace(stringField(fields, videoInputFirstFrame)); url != "" {
		frames = append(frames, openrouter.FrameImage{URL: url, FrameType: openrouter.FrameTypeFirst})
	}
	seed := int64Field(fields, videoInputSeed)
	return openrouter.VideoRequest{
		Model:       strings.TrimSpace(model),
		Prompt:      stringField(fields, videoInputPrompt),
		Duration:    intField(fields, videoInputDuration),
		Resolution:  stringField(fields, videoInputResolution),
		AspectRatio: stringField(fields, videoInputAspectRatio),
		Seed:        &seed,
		// GenerateAudio is left unset on purpose. The backing track these
		// models produce is wanted; only speech is not, and that is handled by
		// giving her nobody to address. Asking for silence removes the track
		// and does not stop the mouth -- both measured.
		FrameImages: frames,
	}
}

// Status maps OpenRouter's job states onto RunPod's, because the handler
// branches on those. An unrecognised state maps to IN_PROGRESS rather than to
// a failure: a clip already paid for must not be abandoned because this build
// has not seen the word before.
func (p *OpenRouterVideoProvider) Status(ctx context.Context, endpointID, jobID string) (*runpod.StatusResponse, error) {
	if p == nil || p.client == nil {
		return nil, runpod.ErrNotConfigured
	}
	status, err := p.client.PollVideo(ctx, jobID)
	if err != nil {
		if errors.Is(err, openrouter.ErrVideoJobFailed) {
			return &runpod.StatusResponse{ID: jobID, Status: runpod.StatusFailed, Error: err.Error()}, nil
		}
		return nil, translateOpenRouterVideoError(err)
	}
	mapped := runpod.StatusInProgress
	if strings.EqualFold(status.Status, openrouter.VideoStatusCompleted) {
		mapped = runpod.StatusCompleted
	}
	return &runpod.StatusResponse{ID: jobID, Status: mapped}, nil
}

// Result returns the finished clip.
//
// Width, height and duration are left at zero: OpenRouter reports none of
// them, and the ingest path measures the file it downloaded rather than
// trusting a provider's claim about it.
func (p *OpenRouterVideoProvider) Result(ctx context.Context, endpointID, jobID string) (*runpod.Result, error) {
	if p == nil || p.client == nil {
		return nil, runpod.ErrNotConfigured
	}
	status, err := p.client.PollVideo(ctx, jobID)
	if err != nil {
		return nil, translateOpenRouterVideoError(err)
	}
	if !strings.EqualFold(status.Status, openrouter.VideoStatusCompleted) {
		return nil, fmt.Errorf("openrouter video: asked for a result while %s", status.Status)
	}
	if len(status.UnsignedURLs) == 0 {
		// PollVideo already refuses this, so reaching here means the contract
		// changed underneath us. Fail loudly rather than store an empty asset.
		return nil, errors.New("openrouter video: completed with no video url")
	}
	return &runpod.Result{
		Video:   &runpod.MediaFile{URL: status.UnsignedURLs[0], ContentType: "video/mp4"},
		ModelID: strings.TrimSpace(endpointID),
	}, nil
}

// Cancel is a no-op. OpenRouter's video API documents no cancellation, and a
// clip that is already generating is already billed -- pretending to cancel it
// would make a timed-out job look cheaper than it was.
func (p *OpenRouterVideoProvider) Cancel(ctx context.Context, endpointID, jobID string) error {
	return nil
}

// translateOpenRouterVideoError maps provider failures onto the sentinels the
// handler already understands, so an unconfigured key or a refused request
// fails the job permanently and is refunded rather than retried forever.
func translateOpenRouterVideoError(err error) error {
	switch {
	case errors.Is(err, openrouter.ErrNotConfigured):
		return fmt.Errorf("%w: %s", runpod.ErrNotConfigured, err.Error())
	case errors.Is(err, openrouter.ErrAccessDenied):
		return fmt.Errorf("%w: %s", runpod.ErrInvalidConfiguration, err.Error())
	default:
		return err
	}
}

func stringField(fields map[string]any, key string) string {
	value, _ := fields[key].(string)
	return value
}

func intField(fields map[string]any, key string) int {
	value, _ := fields[key].(int)
	return value
}

func int64Field(fields map[string]any, key string) int64 {
	value, _ := fields[key].(int64)
	return value
}

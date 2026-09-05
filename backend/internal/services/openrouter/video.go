package openrouter

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Video generation on OpenRouter, as an alternative to the self-hosted RunPod
// path.
//
// The reason for it is latency. A six-second clip takes about 580 seconds on
// the self-hosted Wan 2.2 TI2V-5B, and nobody waits ten minutes. It is also
// nine models behind one credential: comparing them is a model id string
// rather than a vendor account, an auth scheme and a prepaid package.
//
// Submit-then-poll, deliberately the same shape as the RunPod client, because
// the queue's two-phase logic already speaks it.

const videoAPIURL = "https://openrouter.ai/api/v1/videos"

// ErrVideoJobFailed is returned when the provider finished and produced no
// video. It is separate from a transport failure: retrying is pointless.
var ErrVideoJobFailed = errors.New("openrouter: video generation failed")

// FrameImage pins a frame of the clip to an image the caller supplies.
//
// first_frame is the still being animated, which is the whole identity
// mechanism -- the face comes from that image and nothing else. last_frame,
// where a model supports it, is the structural fix for a clip that ends
// mid-gesture: no prompt wording has ever produced a rest position, and this
// does not ask for one, it states it.
type FrameImage struct {
	URL       string
	FrameType string
}

const (
	FrameTypeFirst = "first_frame"
	FrameTypeLast  = "last_frame"
)

// VideoRequest is one clip. Duration, resolution and seed are parameters here
// rather than constants compiled into a worker image, which is the other
// reason to move: changing a clip's length on the self-hosted path needed a
// container rebuild and a template edit.
type VideoRequest struct {
	Model      string
	Prompt     string
	Duration   int
	Resolution string
	// AspectRatio is sent because the provider otherwise derives the frame
	// from the source still. A 3:4 still asked to fill a 9:16 clip comes back
	// padded with black bars rather than cropped, which reads as a broken
	// render.
	AspectRatio string
	Seed        *int64
	// GenerateAudio false asks for a silent clip. It matters because these
	// models speak by default, in a voice the provider chooses -- and every
	// character here already has a stored voice, so a clip that speaks in a
	// different one contradicts her own audio messages.
	//
	// A pointer: unset must mean "provider default", because false is a real
	// request and the two are not the same thing.
	GenerateAudio *bool
	FrameImages   []FrameImage
}

type videoRequestBody struct {
	Model         string           `json:"model"`
	Prompt        string           `json:"prompt"`
	Duration      int              `json:"duration,omitempty"`
	Resolution    string           `json:"resolution,omitempty"`
	AspectRatio   string           `json:"aspect_ratio,omitempty"`
	Seed          *int64           `json:"seed,omitempty"`
	GenerateAudio *bool            `json:"generate_audio,omitempty"`
	FrameImages   []frameImageBody `json:"frame_images,omitempty"`
}

type frameImageBody struct {
	Type      string        `json:"type"`
	ImageURL  frameImageURL `json:"image_url"`
	FrameType string        `json:"frame_type"`
}

type frameImageURL struct {
	URL string `json:"url"`
}

// VideoJob is what a submission returns. The provider answers 202 with an id
// and a polling URL; nothing is rendered yet.
type VideoJob struct {
	ID         string `json:"id"`
	PollingURL string `json:"polling_url"`
	Status     string `json:"status"`
}

// VideoStatus is one poll. UnsignedURLs is populated only once Status is
// completed, and an empty list on a completed job is a provider fault rather
// than an empty result -- see PollVideo.
type VideoStatus struct {
	ID           string   `json:"id"`
	Status       string   `json:"status"`
	UnsignedURLs []string `json:"unsigned_urls"`
	Error        string   `json:"error,omitempty"`
}

const (
	VideoStatusPending   = "pending"
	VideoStatusRunning   = "running"
	VideoStatusCompleted = "completed"
	VideoStatusFailed    = "failed"
)

// Done reports whether polling should stop. Anything not recognised is treated
// as still running: a status this build has not seen is not a reason to
// abandon a clip that has already been paid for.
func (s VideoStatus) Done() bool {
	switch strings.ToLower(strings.TrimSpace(s.Status)) {
	case VideoStatusCompleted, VideoStatusFailed:
		return true
	default:
		return false
	}
}

// SubmitVideo queues one clip and returns immediately.
func (c *Client) SubmitVideo(ctx context.Context, request VideoRequest) (*VideoJob, error) {
	if c.apiKey == "" {
		return nil, ErrNotConfigured
	}
	model := strings.TrimSpace(request.Model)
	if model == "" {
		return nil, errors.New("openrouter: video model is required")
	}
	if !IsValidModelRoute(model) {
		return nil, fmt.Errorf("openrouter: invalid video model route %q", model)
	}
	if strings.TrimSpace(request.Prompt) == "" {
		return nil, errors.New("openrouter: video prompt is required")
	}

	body := videoRequestBody{
		Model:         model,
		Prompt:        strings.TrimSpace(request.Prompt),
		Duration:      request.Duration,
		Resolution:    strings.TrimSpace(request.Resolution),
		AspectRatio:   strings.TrimSpace(request.AspectRatio),
		Seed:          request.Seed,
		GenerateAudio: request.GenerateAudio,
	}
	for _, frame := range request.FrameImages {
		url := strings.TrimSpace(frame.URL)
		if url == "" {
			continue
		}
		body.FrameImages = append(body.FrameImages, frameImageBody{
			Type:      "image_url",
			ImageURL:  frameImageURL{URL: url},
			FrameType: strings.TrimSpace(frame.FrameType),
		})
	}

	encoded, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("openrouter: encode video request: %w", err)
	}

	var job VideoJob
	if err := c.doVideoJSON(ctx, http.MethodPost, c.videoEndpoint(), bytes.NewReader(encoded), &job); err != nil {
		return nil, err
	}
	if strings.TrimSpace(job.ID) == "" {
		return nil, newTransportOrProviderError("openrouter: video submission returned no job id", nil)
	}
	return &job, nil
}

// PollVideo reads one job's current state.
func (c *Client) PollVideo(ctx context.Context, jobID string) (*VideoStatus, error) {
	if c.apiKey == "" {
		return nil, ErrNotConfigured
	}
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return nil, errors.New("openrouter: video job id is required")
	}
	var status VideoStatus
	url := strings.TrimRight(c.videoEndpoint(), "/") + "/" + jobID
	if err := c.doVideoJSON(ctx, http.MethodGet, url, nil, &status); err != nil {
		return nil, err
	}
	if strings.EqualFold(status.Status, VideoStatusFailed) {
		return &status, fmt.Errorf("%w: %s", ErrVideoJobFailed, providerFailureReason(status.Error))
	}
	// A completed job with no URL is the silent-zero shape that has bitten this
	// repository before: the caller would store an asset with no bytes and
	// report success. Fail loudly instead.
	if strings.EqualFold(status.Status, VideoStatusCompleted) && len(status.UnsignedURLs) == 0 {
		return &status, fmt.Errorf("%w: completed with no video url", ErrVideoJobFailed)
	}
	return &status, nil
}

func providerFailureReason(reason string) string {
	if reason = strings.TrimSpace(reason); reason != "" {
		return reason
	}
	return "no reason given"
}

func (c *Client) videoEndpoint() string {
	if endpoint := strings.TrimSpace(c.videoURL); endpoint != "" {
		return endpoint
	}
	return videoAPIURL
}

func (c *Client) doVideoJSON(ctx context.Context, method, url string, body io.Reader, target any) error {
	request, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return fmt.Errorf("openrouter: build video request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.apiKey)
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return newTransportOrProviderError("openrouter: video request failed", err)
	}
	defer response.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return newTransportOrProviderError("openrouter: read video response", err)
	}

	switch {
	case response.StatusCode == http.StatusTooManyRequests:
		return ErrRateLimited
	case response.StatusCode == http.StatusUnauthorized, response.StatusCode == http.StatusForbidden:
		return ErrAccessDenied
	case response.StatusCode >= 400:
		return newTransportOrProviderError(
			fmt.Sprintf("openrouter: video request returned %d: %s",
				response.StatusCode, truncateForError(string(payload))), nil)
	}

	if err := json.Unmarshal(payload, target); err != nil {
		return newTransportOrProviderError("openrouter: decode video response", err)
	}
	return nil
}

func truncateForError(value string) string {
	value = strings.Join(strings.Fields(value), " ")
	if len(value) > 300 {
		return value[:300] + "…"
	}
	return value
}

// WaitForVideo polls until the job finishes or ctx is done.
//
// The interval is fixed rather than exponential: these jobs finish in tens of
// seconds, and a backoff that grows past the job's own duration turns a
// 40-second render into a two-minute wait for no reason.
func (c *Client) WaitForVideo(ctx context.Context, jobID string, interval time.Duration) (*VideoStatus, error) {
	if interval <= 0 {
		interval = 3 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		status, err := c.PollVideo(ctx, jobID)
		if err != nil {
			return status, err
		}
		if status.Done() {
			return status, nil
		}
		select {
		case <-ctx.Done():
			return status, ctx.Err()
		case <-ticker.C:
		}
	}
}

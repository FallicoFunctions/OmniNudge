package queue

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"

	"github.com/omninudge/backend/internal/models"
)

// A clip has to be looked at too.
//
// The only control that inspects what a model actually produced was gated on
// kind == image, so no video output was ever seen. Two of the three video modes
// render a still through the image path first and that still is reviewed, and
// image-to-video animates an asset the user already owns which was reviewed
// when it was made -- so every clip starts from an approved frame. What nothing
// checked is the animation: the model is free to move the subject somewhere the
// still never went, and the model producing that animation is now a hosted one
// whose behaviour is not ours to predict.
//
// Frames are sampled rather than every frame examined. A five-second clip at
// 24fps is 120 pictures and a classifier call each would cost more than the
// render. Three evenly spaced frames is a sampling, and it is stated as one:
// it raises the cost of getting something past the check without claiming to
// make it impossible.

// videoReviewFrameCount is how many frames are sampled from a clip.
//
// Three, at a quarter, a half and three quarters of the way through. Not the
// first frame: that is the source still, which has already been reviewed, so
// spending a classifier call on it re-asks a question already answered. Not the
// last either, which on several providers is the frame most likely to be a
// motion-blurred smear and the least likely to be judged reliably.
const videoReviewFrameCount = 3

// ErrFrameExtractionUnavailable means ffmpeg could not be run at all. It is
// distinct from a clip that yielded no frames: one is infrastructure and one is
// a suspect file, and conflating them would let a corrupt upload look like a
// missing dependency.
var ErrFrameExtractionUnavailable = errors.New("video frame extraction is unavailable")

// extractVideoFrames writes evenly spaced stills from a clip and returns their
// paths with a cleanup function. The caller must call cleanup even on error.
func extractVideoFrames(ctx context.Context, videoPath string, duration float64, count int) ([]string, func(), error) {
	if count <= 0 {
		count = videoReviewFrameCount
	}
	dir, err := os.MkdirTemp("", "omnichat-frames-")
	if err != nil {
		return nil, func() {}, fmt.Errorf("%w: %v", ErrFrameExtractionUnavailable, err)
	}
	cleanup := func() { _ = os.RemoveAll(dir) }

	// Measure the file rather than trust the length the provider claimed. Most
	// report none at all, and an assumed length is worse than no length: a
	// six-second guess on a two-second clip seeks past the end twice and
	// samples once, quietly reviewing a third of what it says it reviews.
	if probed := probeClipDuration(ctx, videoPath); probed > 0 {
		duration = probed
	}
	if duration <= 0 {
		return nil, cleanup, errors.New("the clip has no readable duration")
	}

	paths := make([]string, 0, count)
	for i := 1; i <= count; i++ {
		at := duration * float64(i) / float64(count+1)
		out := filepath.Join(dir, fmt.Sprintf("frame-%d.png", i))
		// #nosec G204 -- ffmpeg is fixed, and every argument is either a number
		// this function computed or a path it created. Nothing reaches a shell.
		cmd := exec.CommandContext(ctx, "ffmpeg",
			"-nostdin", "-loglevel", "error",
			"-ss", strconv.FormatFloat(at, 'f', 3, 64),
			"-i", videoPath,
			"-frames:v", "1", "-f", "image2", "-y", out)
		if err := cmd.Run(); err != nil {
			var notFound *exec.Error
			if errors.As(err, &notFound) {
				return nil, cleanup, fmt.Errorf("%w: %v", ErrFrameExtractionUnavailable, err)
			}
			// One frame failing is not the clip failing. A seek near the end of
			// a short clip can legitimately land past the last frame.
			continue
		}
		if info, statErr := os.Stat(out); statErr == nil && info.Size() > 0 {
			paths = append(paths, out)
		}
	}
	// Fewer frames than asked for is a quieter version of none, and it is the
	// failure this function is most likely to have: a short clip, a wrong
	// duration, a seek that lands past the end. Reviewing one frame while
	// reporting three is worse than reviewing none, because it reads as a
	// check that ran.
	if len(paths) < count {
		return nil, cleanup, fmt.Errorf("read %d of %d frames from the clip", len(paths), count)
	}
	return paths, cleanup, nil
}

// probeClipDuration reads a clip's real length in seconds, or zero.
func probeClipDuration(ctx context.Context, videoPath string) float64 {
	return probeClip(ctx, videoPath).Duration
}

// refuseExplicitClip reviews sampled frames of a clip and refuses the whole
// render if any of them is explicit.
//
// Fails closed on every path that is not a clear pass. A clip nobody could look
// at is not a clip that was found acceptable, and treating "the check could not
// run" as "the check passed" is the one outcome this function exists to
// prevent.
func (h *OmniChatGenerationHandler) refuseExplicitClip(ctx context.Context, job *models.OmniChatGenerationJob, videoPath string, duration float64) error {
	if h.imageReview == nil {
		if h.failClosed {
			return permanentGenerationFailure("image_review_unavailable",
				errors.New("rendered image review is not configured"))
		}
		return nil
	}
	frameCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	frames, cleanup, err := extractVideoFrames(frameCtx, videoPath, duration, videoReviewFrameCount)
	defer cleanup()
	if err != nil {
		if errors.Is(err, ErrFrameExtractionUnavailable) && !h.failClosed {
			// Infrastructure, not content. A deployment that has chosen to run
			// open on a missing reviewer runs open on a missing ffmpeg too,
			// rather than failing every clip for an operator's omission.
			return nil
		}
		return permanentGenerationFailure("image_review_unavailable", err)
	}
	for _, frame := range frames {
		if err := h.refuseExplicitRender(ctx, job, frame, "image/png"); err != nil {
			return err
		}
	}
	return nil
}

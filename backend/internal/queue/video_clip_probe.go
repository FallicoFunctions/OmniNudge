package queue

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/models"
)

// Measure the clip, rather than believe the provider.
//
// The self-hosted worker reports width, height and duration with its result,
// and the ingest path reads them straight through. The hosted provider reports
// none of the three, so every clip it returned was stored with a null width and
// a null height -- for a whole session, while a comment in the adapter claimed
// the ingest path measured the file instead of trusting a claim about it. It
// did not. This is that comment, made true.
//
// Nothing here fails a render. A clip whose dimensions cannot be read is still
// a clip the user paid for; it loses a layout hint, not its content.

// clipMetrics is what ffprobe can tell us about a finished clip. A zero field
// means "not known", never "zero pixels".
type clipMetrics struct {
	Width    int
	Height   int
	Duration float64
}

// probeClip reads a clip's real dimensions and length.
func probeClip(ctx context.Context, videoPath string) clipMetrics {
	// #nosec G204 -- ffprobe is fixed and the path is one this process wrote.
	out, err := exec.CommandContext(ctx, "ffprobe",
		"-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=width,height:format=duration",
		"-of", "default=noprint_wrappers=1",
		videoPath).Output()
	if err != nil {
		return clipMetrics{}
	}
	var metrics clipMetrics
	for _, line := range strings.Split(string(out), "\n") {
		key, value, found := strings.Cut(strings.TrimSpace(line), "=")
		if !found {
			continue
		}
		switch key {
		case "width":
			if n, err := strconv.Atoi(value); err == nil && n > 0 {
				metrics.Width = n
			}
		case "height":
			if n, err := strconv.Atoi(value); err == nil && n > 0 {
				metrics.Height = n
			}
		case "duration":
			if seconds, err := strconv.ParseFloat(value, 64); err == nil && seconds > 0 {
				metrics.Duration = seconds
			}
		}
	}
	return metrics
}

// posterFrameWidth is what a poster is scaled down to. A gallery tile shows it
// at a few hundred pixels, and a 2K still costs more to store and to send than
// the clip's first second.
const posterFrameWidth = 640

// extractPosterFrame writes a still to stand in for the clip before it plays,
// and returns its path with a cleanup function. The caller must call cleanup
// even on error.
//
// Taken a moment in rather than at the very start: a clip that fades up or
// begins on a blink opens on a frame that represents nothing.
func extractPosterFrame(ctx context.Context, videoPath string, duration float64) (string, func(), error) {
	dir, err := os.MkdirTemp("", "omnichat-poster-")
	if err != nil {
		return "", func() {}, fmt.Errorf("%w: %v", ErrFrameExtractionUnavailable, err)
	}
	cleanup := func() { _ = os.RemoveAll(dir) }

	at := 1.0
	if duration > 0 {
		at = math.Min(at, duration/2)
	}
	out := filepath.Join(dir, "poster.jpg")
	// #nosec G204 -- ffmpeg is fixed, and every argument is either a number
	// this function computed or a path it created. Nothing reaches a shell.
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-nostdin", "-loglevel", "error",
		"-ss", strconv.FormatFloat(at, 'f', 3, 64),
		"-i", videoPath,
		"-frames:v", "1",
		"-vf", fmt.Sprintf("scale=%d:-2", posterFrameWidth),
		"-q:v", "3",
		"-f", "image2", "-y", out)
	if err := cmd.Run(); err != nil {
		var notFound *exec.Error
		if errors.As(err, &notFound) {
			return "", cleanup, fmt.Errorf("%w: %v", ErrFrameExtractionUnavailable, err)
		}
		return "", cleanup, fmt.Errorf("extract poster frame: %w", err)
	}
	info, err := os.Stat(out)
	if err != nil || info.Size() == 0 {
		return "", cleanup, errors.New("the poster frame is empty")
	}
	return out, cleanup, nil
}

// storePosterFrame extracts a poster from a clip and uploads it beside that
// clip, returning the URL to record and the storage key to clean up. Both are
// empty when there is no poster.
//
// A missing poster is never a reason to fail a render. The user paid for the
// clip, the clip is in hand, and a gallery tile without a preview is a smaller
// loss than a refund and a retry.
func (h *OmniChatGenerationHandler) storePosterFrame(
	ctx context.Context, job *models.OmniChatGenerationJob, videoPath string, duration float64,
) (string, string) {
	posterPath, cleanup, err := extractPosterFrame(ctx, videoPath, duration)
	defer cleanup()
	if err != nil {
		zlog.Warn().Err(err).Str("job_id", job.ID.String()).
			Msg("omnichat: the clip has no poster frame")
		return "", ""
	}
	file, err := os.Open(posterPath)
	if err != nil {
		zlog.Warn().Err(err).Str("job_id", job.ID.String()).
			Msg("omnichat: the poster frame could not be read")
		return "", ""
	}
	defer func() { _ = file.Close() }()

	key := fmt.Sprintf("omnichat/generated/%d/%s-poster.jpg", job.OwnerUserID, job.ID.String())
	if _, err := h.storage.Upload(ctx, key, file, "image/jpeg"); err != nil {
		zlog.Warn().Err(err).Str("job_id", job.ID.String()).
			Msg("omnichat: the poster frame could not be stored")
		return "", ""
	}
	return "/uploads/" + key, key
}

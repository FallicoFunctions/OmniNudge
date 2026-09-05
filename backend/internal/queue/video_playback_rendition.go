package queue

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"

	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/models"
)

// What gets stored is what gets played.
//
// The hosted model returns 2K. A real render came back 1440x2528 and 6.6 MB
// for six and a half seconds, and that whole file goes down the wire before a
// chat bubble can show anything. A portrait clip in a chat column is displayed
// a few hundred pixels wide, so most of those pixels are paid for and then
// thrown away by the browser.
//
// This is deliberately not the HLS transcode the queue already owns. Segmented
// delivery buys a head start on a long file; on a six-second clip the whole
// clip is one segment, so it buys nothing and costs an encode and a directory
// of objects. Re-encoding at the same 2K saves about a tenth. Reducing the
// clip to 1080 saves two thirds. The size is the only part worth having, so
// this takes the size and leaves the segmenter alone.

// playbackShortEdge is the cap on a clip's shorter side.
//
// Named for the short edge rather than the width because the two orientations
// must mean the same thing: 1080 is what "1080p" means for a landscape clip and
// what a portrait clip needs to fill a phone. Capping the width instead would
// shrink a 2560x1440 landscape clip to 1080x608.
const playbackShortEdge = 1080

// playbackScale returns the size to re-encode to, and false when the clip is
// already small enough to leave alone.
//
// Both sides are rounded down to an even number: H.264 chroma subsampling
// cannot represent an odd dimension, and ffmpeg fails outright rather than
// rounding for you.
func playbackScale(width, height int) (int, int, bool) {
	if width <= 0 || height <= 0 {
		return 0, 0, false
	}
	short := width
	if height < short {
		short = height
	}
	if short <= playbackShortEdge {
		return 0, 0, false
	}
	ratio := float64(playbackShortEdge) / float64(short)
	scaled := func(side int) int {
		n := int(float64(side)*ratio + 0.5)
		return n - n%2
	}
	targetWidth, targetHeight := scaled(width), scaled(height)
	if targetWidth <= 0 || targetHeight <= 0 {
		return 0, 0, false
	}
	return targetWidth, targetHeight, true
}

// reduceClipForPlayback re-encodes a clip down to the playback cap and returns
// the new file's path, its size, and a cleanup function.
//
// The audio is copied rather than re-encoded. The backing track a model returns
// is already AAC, and a second lossy pass over it costs quality for nothing.
//
// A clip that is already small enough, or one this cannot re-encode, comes back
// unchanged with ok false. Losing the reduction is a bigger file; failing the
// job would be a lost render the user paid for.
func reduceClipForPlayback(ctx context.Context, videoPath string, width, height int) (string, int64, func(), bool) {
	targetWidth, targetHeight, needed := playbackScale(width, height)
	if !needed {
		return "", 0, func() {}, false
	}
	dir, err := os.MkdirTemp("", "omnichat-playback-")
	if err != nil {
		return "", 0, func() {}, false
	}
	cleanup := func() { _ = os.RemoveAll(dir) }

	// The container comes from the source file's own name. ffmpeg picks its
	// output muxer from the output name, so an output with no extension fails
	// outright -- which is what happened for every real render, because the
	// downloaded file had no extension and only the test fixture did.
	extension := filepath.Ext(videoPath)
	if extension == "" {
		extension = ".mp4"
	}
	out := filepath.Join(dir, "playback"+extension)
	// #nosec G204 -- ffmpeg is fixed, and every argument is either a number
	// this function computed or a path it created. Nothing reaches a shell.
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-nostdin", "-loglevel", "error",
		"-i", videoPath,
		"-vf", "scale="+strconv.Itoa(targetWidth)+":"+strconv.Itoa(targetHeight),
		"-c:v", "libx264", "-preset", "fast", "-crf", "23",
		"-pix_fmt", "yuv420p",
		"-movflags", "+faststart",
		"-c:a", "copy",
		"-y", out)
	if err := cmd.Run(); err != nil {
		cleanup()
		return "", 0, func() {}, false
	}
	info, err := os.Stat(out)
	if err != nil || info.Size() == 0 {
		cleanup()
		return "", 0, func() {}, false
	}
	// A reduction that grew the file is not a reduction. Rare, but a very short
	// or very flat clip can encode larger than it arrived, and storing the
	// bigger of the two would be the opposite of the point.
	if original, err := os.Stat(videoPath); err == nil && info.Size() >= original.Size() {
		cleanup()
		return "", 0, func() {}, false
	}
	return out, info.Size(), cleanup, true
}

// applyPlaybackRendition swaps a downloaded clip for a smaller re-encode of
// itself, in place, and reports the size that will be stored.
//
// It returns the dimensions actually stored, so the row describes the file the
// user will play rather than the one the provider sent.
func applyPlaybackRendition(
	ctx context.Context, job *models.OmniChatGenerationJob, download *generatedMediaDownload, metrics clipMetrics,
) (int, int, func()) {
	path, size, cleanup, ok := reduceClipForPlayback(ctx, download.Path, metrics.Width, metrics.Height)
	if !ok {
		return metrics.Width, metrics.Height, func() {}
	}
	targetWidth, targetHeight, _ := playbackScale(metrics.Width, metrics.Height)
	zlog.Info().
		Str("job_id", job.ID.String()).
		Int("from_width", metrics.Width).Int("from_height", metrics.Height).
		Int("to_width", targetWidth).Int("to_height", targetHeight).
		Int64("from_bytes", download.Size).Int64("to_bytes", size).
		Msg("omnichat: the clip was reduced for playback")
	download.Path = path
	download.Size = size
	return targetWidth, targetHeight, cleanup
}

package queue

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// reviewSpy records every path it was asked to judge, and refuses whichever one
// it is told to.
type reviewSpy struct {
	seen      []string
	explicit  map[string]bool
	failWith  error
	standards []services.OmniChatImageStandard
}

func (r *reviewSpy) ReviewRenderedImageAgainst(
	_ context.Context, path, _ string, standard services.OmniChatImageStandard,
) (bool, error) {
	r.seen = append(r.seen, filepath.Base(path))
	r.standards = append(r.standards, standard)
	if r.failWith != nil {
		return false, r.failWith
	}
	return r.explicit[filepath.Base(path)], nil
}

func ffmpegOrSkip(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg is not installed")
	}
}

// A two-second clip of solid colour, made here rather than committed: a binary
// fixture in this repository is the accident that once needed a history
// rewrite.
func makeTestClip(t *testing.T, seconds string) string {
	t.Helper()
	ffmpegOrSkip(t)
	path := filepath.Join(t.TempDir(), "clip.mp4")
	cmd := exec.Command("ffmpeg", "-nostdin", "-loglevel", "error",
		"-f", "lavfi", "-i", "color=c=green:s=64x64:d="+seconds,
		"-pix_fmt", "yuv420p", "-y", path)
	require.NoError(t, cmd.Run())
	return path
}

func TestExtractVideoFramesSamplesTheClip(t *testing.T) {
	clip := makeTestClip(t, "2")

	frames, cleanup, err := extractVideoFrames(context.Background(), clip, 2, 3)
	defer cleanup()

	require.NoError(t, err)
	require.Len(t, frames, 3)
	for _, frame := range frames {
		info, statErr := os.Stat(frame)
		require.NoError(t, statErr)
		require.Greater(t, info.Size(), int64(0), "an empty frame is not a frame")
	}
}

// The cleanup has to remove what it made. A worker that leaves three PNGs per
// clip in the temp directory fills a disk slowly enough that nobody connects
// the two.
func TestExtractVideoFramesCleansUpAfterItself(t *testing.T) {
	clip := makeTestClip(t, "2")

	frames, cleanup, err := extractVideoFrames(context.Background(), clip, 2, 3)
	require.NoError(t, err)
	dir := filepath.Dir(frames[0])
	cleanup()

	_, err = os.Stat(dir)
	require.True(t, os.IsNotExist(err), "the frame directory survived cleanup")
}

// A file that is not a video yields nothing, and nothing is a refusal rather
// than a pass.
func TestExtractVideoFramesRefusesAFileWithNoFrames(t *testing.T) {
	ffmpegOrSkip(t)
	path := filepath.Join(t.TempDir(), "not-a-clip.mp4")
	require.NoError(t, os.WriteFile(path, []byte("this is not a video"), 0o600))

	_, cleanup, err := extractVideoFrames(context.Background(), path, 5, 3)
	defer cleanup()

	require.Error(t, err)
	require.NotErrorIs(t, err, ErrFrameExtractionUnavailable,
		"a bad file is content, not missing infrastructure, and the two must not be conflated")
}

func TestRefuseExplicitClipReviewsEveryFrame(t *testing.T) {
	clip := makeTestClip(t, "2")
	spy := &reviewSpy{explicit: map[string]bool{}}
	handler := &OmniChatGenerationHandler{imageReview: spy, failClosed: true}

	err := handler.refuseExplicitClip(context.Background(),
		&models.OmniChatGenerationJob{Mode: models.OmniChatGenerationModeImageToVideo}, clip, 2)

	require.NoError(t, err)
	require.Len(t, spy.seen, videoReviewFrameCount, "every sampled frame must be judged")
}

// One explicit frame refuses the clip. Reviewing three and acting on none of
// them would be a check that costs money and decides nothing.
func TestRefuseExplicitClipRefusesWhenAnyFrameIsExplicit(t *testing.T) {
	clip := makeTestClip(t, "2")
	spy := &reviewSpy{explicit: map[string]bool{"frame-2.png": true}}
	handler := &OmniChatGenerationHandler{imageReview: spy, failClosed: true}

	err := handler.refuseExplicitClip(context.Background(),
		&models.OmniChatGenerationJob{Mode: models.OmniChatGenerationModeImageToVideo}, clip, 2)

	require.Error(t, err)
}

// A clip nobody could look at is not a clip that was found acceptable. Treating
// "the check could not run" as "the check passed" is the one outcome this
// exists to prevent.
func TestRefuseExplicitClipFailsClosedOnAnUnreadableClip(t *testing.T) {
	ffmpegOrSkip(t)
	path := filepath.Join(t.TempDir(), "broken.mp4")
	require.NoError(t, os.WriteFile(path, []byte("nope"), 0o600))
	spy := &reviewSpy{explicit: map[string]bool{}}
	handler := &OmniChatGenerationHandler{imageReview: spy, failClosed: true}

	err := handler.refuseExplicitClip(context.Background(),
		&models.OmniChatGenerationJob{Mode: models.OmniChatGenerationModeImageToVideo}, path, 2)

	require.Error(t, err)
	require.Empty(t, spy.seen, "nothing was reviewed, so nothing may be reported as reviewed")
}

// An unconfigured reviewer on a fail-closed deployment refuses, exactly as it
// does for an image. The gap this whole file closes was a video path that
// checked nothing at all.
func TestRefuseExplicitClipRefusesWithNoReviewerWhenFailClosed(t *testing.T) {
	handler := &OmniChatGenerationHandler{failClosed: true}

	err := handler.refuseExplicitClip(context.Background(),
		&models.OmniChatGenerationJob{Mode: models.OmniChatGenerationModeImageToVideo},
		filepath.Join(t.TempDir(), "missing.mp4"), 2)

	require.ErrorContains(t, err, "rendered image review is not configured")
}

// The gate, not the function.
//
// Removing the video case from the switch in the persist path left the whole
// suite green: every test above proves refuseExplicitClip works when it is
// called, and none proved a video job calls it. That is the same shape as the
// adapter whose reads nothing checked -- a thing tested and its wiring not.
func TestAVideoJobActuallyReachesTheClipReview(t *testing.T) {
	ffmpegOrSkip(t)
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	provider := &twoPhaseProviderFake{}
	storage := &twoPhaseStorageFake{}
	handler := newTwoPhaseHandler(t, store, provider, storage)

	spy := &reviewSpy{explicit: map[string]bool{}}
	handler.imageReview = spy
	// A real clip for the video phase, so frames can actually be read from it.
	clip := makeTestClip(t, "2")
	handler.downloadMedia = func(_ context.Context, _ string, kind modelsMediaKind, _ int64, _ *mediaBearer, _ ...string) (*generatedMediaDownload, func(), error) {
		if kind == modelsMediaKind(models.OmniChatMediaKindVideo) {
			return &generatedMediaDownload{
				Path: clip, Size: 14, ContentType: "video/mp4", Extension: ".mp4",
			}, func() {}, nil
		}
		path := filepath.Join(t.TempDir(), "still.png")
		require.NoError(t, os.WriteFile(path, []byte("still-bytes"), 0o600))
		return &generatedMediaDownload{
			Path: path, Size: 11, ContentType: "image/png", Extension: ".png",
		}, func() {}, nil
	}

	require.NoError(t, handler.process(context.Background(), store.job.ID))

	// One for the still, then one per sampled frame of the clip. Before this,
	// the clip contributed nothing.
	require.Greater(t, len(spy.seen), 1,
		"a video job reviewed only its still: the clip itself was never looked at")
	require.Contains(t, spy.seen, "frame-1.png")
	require.Contains(t, spy.seen, "frame-2.png")
	require.Contains(t, spy.seen, "frame-3.png")
}

// A partial sample is the likeliest failure and the quietest: a short clip, a
// wrong duration, a seek past the end. Reviewing one frame while reporting
// three is worse than reviewing none, because it reads as a check that ran.
func TestExtractVideoFramesRefusesAPartialSample(t *testing.T) {
	clip := makeTestClip(t, "2")

	// Ten frames cannot be sampled from two seconds of video at these offsets.
	_, cleanup, err := extractVideoFrames(context.Background(), clip, 2, 60)
	defer cleanup()

	require.Error(t, err)
	require.ErrorContains(t, err, "frames from the clip")
}

// The measured length wins over whatever the provider claimed. Most report
// none, and a six-second guess on a two-second clip seeks past the end twice.
func TestExtractVideoFramesMeasuresRatherThanTrusts(t *testing.T) {
	clip := makeTestClip(t, "2")

	frames, cleanup, err := extractVideoFrames(context.Background(), clip, 600, 3)
	defer cleanup()

	require.NoError(t, err, "a wildly wrong claimed duration must not reduce the sample")
	require.Len(t, frames, 3)
}

package queue

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

// A patterned clip at a real size. Solid colour compresses to almost nothing at
// any resolution, which would make a reduction look like it grew the file.
func makeSizedTestClip(t *testing.T, size string) string {
	t.Helper()
	ffmpegOrSkip(t)
	path := filepath.Join(t.TempDir(), "sized.mp4")
	cmd := exec.Command("ffmpeg", "-nostdin", "-loglevel", "error",
		"-f", "lavfi", "-i", "testsrc2=s="+size+":d=2:r=24",
		"-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
		"-pix_fmt", "yuv420p", "-y", path)
	require.NoError(t, cmd.Run())
	return path
}

func TestPlaybackScaleCapsTheShortEdge(t *testing.T) {
	for _, tc := range []struct {
		name                  string
		width, height         int
		wantWidth, wantHeight int
		wantScaling           bool
	}{
		// The clip the real render produced.
		{"portrait 2K", 1440, 2528, 1080, 1896, true},
		// Capping the width instead of the short edge would make this 1080x608.
		{"landscape 2K", 2560, 1440, 1920, 1080, true},
		{"square", 2048, 2048, 1080, 1080, true},
		{"already small", 640, 480, 0, 0, false},
		{"exactly at the cap", 1920, 1080, 0, 0, false},
		{"nothing known", 0, 0, 0, 0, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			width, height, scaling := playbackScale(tc.width, tc.height)
			require.Equal(t, tc.wantScaling, scaling)
			require.Equal(t, tc.wantWidth, width)
			require.Equal(t, tc.wantHeight, height)
		})
	}
}

// H.264 cannot encode an odd dimension, and ffmpeg fails rather than rounding.
func TestPlaybackScaleAlwaysReturnsEvenSides(t *testing.T) {
	for _, size := range [][2]int{{1441, 2529}, {3841, 2161}, {1234, 4321}} {
		width, height, scaling := playbackScale(size[0], size[1])
		require.True(t, scaling)
		require.Zero(t, width%2, "width %d is odd", width)
		require.Zero(t, height%2, "height %d is odd", height)
	}
}

func TestReduceClipForPlaybackShrinksTheFile(t *testing.T) {
	clip := makeSizedTestClip(t, "1440x2528")
	before, err := os.Stat(clip)
	require.NoError(t, err)

	path, size, cleanup, ok := reduceClipForPlayback(context.Background(), clip, 1440, 2528)
	defer cleanup()

	require.True(t, ok)
	require.Less(t, size, before.Size(), "the reduction did not reduce anything")
	metrics := probeClip(context.Background(), path)
	require.Equal(t, 1080, metrics.Width)
	require.Equal(t, 1896, metrics.Height)
}

// A clip already inside the cap is left exactly as it arrived. Re-encoding it
// would cost quality and time to save nothing.
func TestReduceClipForPlaybackLeavesASmallClipAlone(t *testing.T) {
	clip := makeSizedTestClip(t, "640x480")

	_, _, cleanup, ok := reduceClipForPlayback(context.Background(), clip, 640, 480)
	defer cleanup()

	require.False(t, ok)
}

func TestReduceClipForPlaybackCleansUpAfterItself(t *testing.T) {
	clip := makeSizedTestClip(t, "1440x2528")

	path, _, cleanup, ok := reduceClipForPlayback(context.Background(), clip, 1440, 2528)
	require.True(t, ok)
	dir := filepath.Dir(path)
	cleanup()

	_, err := os.Stat(dir)
	require.True(t, err != nil && os.IsNotExist(err), "the rendition directory survived cleanup")
}

// A file ffmpeg cannot read leaves the original in place rather than failing a
// render the user paid for.
func TestReduceClipForPlaybackKeepsTheOriginalWhenItCannotEncode(t *testing.T) {
	ffmpegOrSkip(t)
	path := filepath.Join(t.TempDir(), "broken.mp4")
	require.NoError(t, os.WriteFile(path, []byte("not a video"), 0o600))

	_, _, cleanup, ok := reduceClipForPlayback(context.Background(), path, 1440, 2528)
	defer cleanup()

	require.False(t, ok)
}

// The gate, not the function.
//
// Every test above passes with the reduction wired to nothing, so this drives a
// whole video job and checks that what reached storage is the smaller file and
// that the row describes it rather than the 2K the provider sent.
func TestAVideoJobStoresTheReducedClip(t *testing.T) {
	ffmpegOrSkip(t)
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	provider := &twoPhaseProviderFake{}
	storage := &twoPhaseStorageFake{}
	handler := newTwoPhaseHandler(t, store, provider, storage)

	clip := makeSizedTestClip(t, "1440x2528")
	original, err := os.Stat(clip)
	require.NoError(t, err)
	handler.downloadMedia = func(_ context.Context, _ string, kind modelsMediaKind, _ int64, _ *mediaBearer, _ ...string) (*generatedMediaDownload, func(), error) {
		if kind == modelsMediaKind(models.OmniChatMediaKindVideo) {
			return &generatedMediaDownload{
				Path: clip, Size: original.Size(), ContentType: "video/mp4", Extension: ".mp4",
			}, func() {}, nil
		}
		path := filepath.Join(t.TempDir(), "still.png")
		require.NoError(t, os.WriteFile(path, []byte("still-bytes"), 0o600))
		return &generatedMediaDownload{
			Path: path, Size: 11, ContentType: "image/png", Extension: ".png",
		}, func() {}, nil
	}

	require.NoError(t, handler.process(context.Background(), store.job.ID))

	media := store.completedMedia
	require.NotNil(t, media)
	require.NotNil(t, media.Width)
	require.NotNil(t, media.Height)
	require.Equal(t, 1080, *media.Width, "the row still describes the 2K the provider sent")
	require.Equal(t, 1896, *media.Height)
	require.Less(t, media.FileSize, original.Size(), "the 2K clip was stored unchanged")
}

// The shape of the real path, not the shape of a convenient fixture.
//
// downloadGeneratedMedia writes to os.CreateTemp with the pattern
// "omnichat-generated-*", and the file type is decided afterwards by sniffing
// the bytes -- so for every real render the path had no extension. ffmpeg picks
// its output container from the output name, so the rendition was written to a
// name with no extension and failed. Every test passed, because every test
// handed it a file called something.mp4.
func TestReduceClipForPlaybackWorksOnAPathWithNoExtension(t *testing.T) {
	clip := makeSizedTestClip(t, "1440x2528")
	source, err := os.ReadFile(clip)
	require.NoError(t, err)

	nameless, err := os.CreateTemp(t.TempDir(), "omnichat-generated-*")
	require.NoError(t, err)
	_, err = nameless.Write(source)
	require.NoError(t, err)
	require.NoError(t, nameless.Close())
	require.Empty(t, filepath.Ext(nameless.Name()), "this test is only meaningful without an extension")

	path, size, cleanup, ok := reduceClipForPlayback(context.Background(), nameless.Name(), 1440, 2528)
	defer cleanup()

	require.True(t, ok, "the reduction never ran on a real download")
	require.Greater(t, size, int64(0))
	require.Equal(t, 1080, probeClip(context.Background(), path).Width)
}

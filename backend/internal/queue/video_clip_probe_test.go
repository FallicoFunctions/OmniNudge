package queue

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

func TestProbeClipReadsTheRealDimensions(t *testing.T) {
	clip := makeTestClip(t, "2")

	metrics := probeClip(context.Background(), clip)

	require.Equal(t, 64, metrics.Width)
	require.Equal(t, 64, metrics.Height)
	require.InDelta(t, 2.0, metrics.Duration, 0.3)
}

// A file nothing can read reports nothing. Zero must mean "not known" all the
// way through, so that the caller keeps whatever the provider claimed rather
// than storing a clip that is nought pixels wide.
func TestProbeClipReportsNothingForAFileItCannotRead(t *testing.T) {
	ffmpegOrSkip(t)
	path := filepath.Join(t.TempDir(), "not-a-clip.mp4")
	require.NoError(t, os.WriteFile(path, []byte("this is not a video"), 0o600))

	metrics := probeClip(context.Background(), path)

	require.Zero(t, metrics.Width)
	require.Zero(t, metrics.Height)
	require.Zero(t, metrics.Duration)
}

// The gate, not the function.
//
// A real render through the queue stored a clip with a null width and a null
// height, because the ingest path read the dimensions the provider reported and
// the hosted provider reports none. Every unit test above passes with the
// measurement wired to nothing, so this drives a whole video job and reads the
// row it wrote.
func TestAVideoJobRecordsWhatTheClipActuallyIs(t *testing.T) {
	ffmpegOrSkip(t)
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	provider := &twoPhaseProviderFake{}
	storage := &twoPhaseStorageFake{}
	handler := newTwoPhaseHandler(t, store, provider, storage)

	// 64x64 and two seconds. The provider fake reports no dimensions at all and
	// claims five seconds, exactly as the hosted provider does.
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

	media := store.completedMedia
	require.NotNil(t, media)
	require.NotNil(t, media.Width, "the clip was stored with no width")
	require.NotNil(t, media.Height, "the clip was stored with no height")
	require.Equal(t, 64, *media.Width)
	require.Equal(t, 64, *media.Height)
	require.NotNil(t, media.Duration)
	require.Equal(t, 2, *media.Duration, "the measured length beats the provider's claim of five")
}

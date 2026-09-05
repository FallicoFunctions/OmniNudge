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

func TestExtractPosterFrameWritesAScaledStill(t *testing.T) {
	clip := makeTestClip(t, "2")

	poster, cleanup, err := extractPosterFrame(context.Background(), clip, 2)
	defer cleanup()

	require.NoError(t, err)
	info, err := os.Stat(poster)
	require.NoError(t, err)
	require.Greater(t, info.Size(), int64(0), "an empty poster is not a poster")
	// A clip narrower than the poster width is not enlarged to meet it.
	require.LessOrEqual(t, probeClip(context.Background(), poster).Width, posterFrameWidth)
}

// The offset is a second in, and a clip shorter than that must still yield a
// poster rather than a seek past the end.
func TestExtractPosterFrameHandlesAClipShorterThanTheOffset(t *testing.T) {
	clip := makeTestClip(t, "0.5")

	poster, cleanup, err := extractPosterFrame(context.Background(), clip, 0.5)
	defer cleanup()

	require.NoError(t, err)
	info, err := os.Stat(poster)
	require.NoError(t, err)
	require.Greater(t, info.Size(), int64(0))
}

func TestExtractPosterFrameCleansUpAfterItself(t *testing.T) {
	clip := makeTestClip(t, "2")

	poster, cleanup, err := extractPosterFrame(context.Background(), clip, 2)
	require.NoError(t, err)
	dir := filepath.Dir(poster)
	cleanup()

	_, err = os.Stat(dir)
	require.True(t, os.IsNotExist(err), "the poster directory survived cleanup")
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

// A clip with no poster is a black rectangle in the gallery until it plays.
func TestAVideoJobStoresAPosterBesideTheClip(t *testing.T) {
	ffmpegOrSkip(t)
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	provider := &twoPhaseProviderFake{}
	storage := &twoPhaseStorageFake{}
	handler := newTwoPhaseHandler(t, store, provider, storage)

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

	require.NotNil(t, store.completedMedia)
	require.NotNil(t, store.completedMedia.ThumbnailURL, "the clip was stored with no poster")
	posterKey := "omnichat/generated/" + "41" + "/" + store.job.ID.String() + "-poster.jpg"
	require.Contains(t, storage.uploads, posterKey, "the poster was never uploaded")
	// Never a direct storage URL: the poster is as private as the clip.
	require.Equal(t, "/uploads/"+posterKey, *store.completedMedia.ThumbnailURL)
}

// The poster is a convenience. Losing it must not lose the render the user paid
// for, so a failure to make one leaves the job succeeded and the field empty.
func TestAClipWithNoReadablePosterStillSucceeds(t *testing.T) {
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	provider := &twoPhaseProviderFake{}
	storage := &twoPhaseStorageFake{}
	handler := newTwoPhaseHandler(t, store, provider, storage)

	// The default fake hands back a text file named .mp4: no frames, no poster.
	require.NoError(t, handler.process(context.Background(), store.job.ID))

	require.Equal(t, 1, store.completeCalls)
	require.Nil(t, store.completedMedia.ThumbnailURL)
}

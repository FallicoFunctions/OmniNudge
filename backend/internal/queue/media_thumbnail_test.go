package queue

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// A real PNG, because the thumbnail service decodes what it is given rather
// than trusting the name.
func writeTestPNG(t *testing.T, dir string) string {
	t.Helper()
	ffmpegOrSkip(t)
	path := filepath.Join(dir, "still.png")
	require.NoError(t, runFFmpeg("-f", "lavfi", "-i", "testsrc2=s=896x1120:d=1", "-frames:v", "1", "-y", path))
	return path
}

func thumbnailHandler(t *testing.T, store *twoPhaseStoreFake, provider *twoPhaseProviderFake, storage *twoPhaseStorageFake) *OmniChatGenerationHandler {
	t.Helper()
	return newTwoPhaseHandler(t, store, provider, storage).SetThumbnails(services.NewThumbnailService())
}

// The gate, not the function.
//
// A gallery grid fetched every asset it listed, whole, to draw a tile a few
// hundred pixels wide -- about a megabyte for a generated image and 6.6 MB for
// one real clip, on every visit. Both kinds must come out of the queue with a
// tile image beside them, and the wiring is what proves it: the service knows
// how to make one, and that says nothing about whether a job asks it to.
//
// The key is asserted in full, extension included. A two-phase video job stores
// its still and then its clip under one job id, and a thumbnail named for the
// job alone was one object for both -- the clip's overwriting the still's.
func TestAFinishedRenderStoresAThumbnailBesideIt(t *testing.T) {
	for name, kind := range map[string]models.OmniChatMediaKind{
		"a clip":  models.OmniChatMediaKindVideo,
		"a still": models.OmniChatMediaKindImage,
	} {
		t.Run(name, func(t *testing.T) {
			ffmpegOrSkip(t)
			job := newSceneVideoJob()
			if kind == models.OmniChatMediaKindImage {
				job.Kind = models.OmniChatMediaKindImage
				job.Mode = models.OmniChatGenerationModeCreate
			}
			store := &twoPhaseStoreFake{job: job}
			storage := &twoPhaseStorageFake{}
			handler := thumbnailHandler(t, store, &twoPhaseProviderFake{}, storage)

			dir := t.TempDir()
			clip := makeTestClip(t, "2")
			still := writeTestPNG(t, dir)
			handler.downloadMedia = func(_ context.Context, _ string, downloadKind modelsMediaKind, _ int64, _ *mediaBearer, _ ...string) (*generatedMediaDownload, func(), error) {
				if downloadKind == modelsMediaKind(models.OmniChatMediaKindVideo) {
					return &generatedMediaDownload{Path: clip, Size: 14, ContentType: "video/mp4", Extension: ".mp4"}, func() {}, nil
				}
				return &generatedMediaDownload{Path: still, Size: 11, ContentType: "image/png", Extension: ".png"}, func() {}, nil
			}

			require.NoError(t, handler.process(context.Background(), store.job.ID))

			media := store.completedMedia
			require.NotNil(t, media)
			require.NotNil(t, media.ThumbnailURL, "the render was stored with no thumbnail")
			extension := ".mp4"
			if kind == models.OmniChatMediaKindImage {
				extension = ".png"
			}
			key := "omnichat/generated/41/" + store.job.ID.String() + extension + "-thumb.jpg"
			require.Contains(t, storage.uploads, key, "the thumbnail was never uploaded")
			// Never a direct storage URL: the thumbnail is as private as the
			// asset it stands for.
			require.Equal(t, "/uploads/"+key, *media.ThumbnailURL)
		})
	}
}

// The thumbnail is a convenience. Losing it must not lose the render the user
// paid for, so a failure to make one leaves the job succeeded and the field
// empty rather than falling back to serving the asset.
func TestARenderWithNoUsableThumbnailStillSucceeds(t *testing.T) {
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	storage := &twoPhaseStorageFake{}
	handler := thumbnailHandler(t, store, &twoPhaseProviderFake{}, storage)

	// The default fake hands back a text file named .mp4: nothing to read.
	require.NoError(t, handler.process(context.Background(), store.job.ID))

	require.Equal(t, 1, store.completeCalls)
	require.Nil(t, store.completedMedia.ThumbnailURL)
}

// An unconfigured deployment stores no thumbnail and fails nothing.
func TestAHandlerWithNoThumbnailServiceStillFinishesTheJob(t *testing.T) {
	ffmpegOrSkip(t)
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	storage := &twoPhaseStorageFake{}
	handler := newTwoPhaseHandler(t, store, &twoPhaseProviderFake{}, storage)

	clip := makeTestClip(t, "2")
	handler.downloadMedia = func(_ context.Context, _ string, kind modelsMediaKind, _ int64, _ *mediaBearer, _ ...string) (*generatedMediaDownload, func(), error) {
		if kind == modelsMediaKind(models.OmniChatMediaKindVideo) {
			return &generatedMediaDownload{Path: clip, Size: 14, ContentType: "video/mp4", Extension: ".mp4"}, func() {}, nil
		}
		path := filepath.Join(t.TempDir(), "still.png")
		require.NoError(t, os.WriteFile(path, []byte("still-bytes"), 0o600))
		return &generatedMediaDownload{Path: path, Size: 11, ContentType: "image/png", Extension: ".png"}, func() {}, nil
	}

	require.NoError(t, handler.process(context.Background(), store.job.ID))

	require.Equal(t, 1, store.completeCalls)
	require.Nil(t, store.completedMedia.ThumbnailURL)
}

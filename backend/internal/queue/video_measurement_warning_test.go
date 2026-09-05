package queue

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

// A clip nobody could measure is stored with no width and no height. That is
// the original defect exactly, and it stayed invisible for a whole session
// because nothing anywhere said it had happened. A worker with no ffprobe must
// not reproduce it quietly.
func TestAClipThatCannotBeMeasuredSaysSo(t *testing.T) {
	var log bytes.Buffer
	original := zlog.Logger
	zlog.Logger = zerolog.New(&log)
	t.Cleanup(func() { zlog.Logger = original })

	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	provider := &twoPhaseProviderFake{}
	storage := &twoPhaseStorageFake{}
	handler := newTwoPhaseHandler(t, store, provider, storage)

	// The default fake hands back a text file named .mp4: no streams, nothing
	// to measure.
	require.NoError(t, handler.process(context.Background(), store.job.ID))

	require.Nil(t, store.completedMedia.Width, "an unmeasurable clip reported a width")
	require.Contains(t, log.String(), "stored with no dimensions",
		"the clip lost its dimensions and nothing said so")
}

// The measurement succeeding must stay quiet. A warning on every clip is a
// warning nobody reads.
func TestAMeasuredClipSaysNothing(t *testing.T) {
	ffmpegOrSkip(t)
	var log bytes.Buffer
	original := zlog.Logger
	zlog.Logger = zerolog.New(&log)
	t.Cleanup(func() { zlog.Logger = original })

	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	provider := &twoPhaseProviderFake{}
	storage := &twoPhaseStorageFake{}
	handler := newTwoPhaseHandler(t, store, provider, storage)

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

	require.NotContains(t, log.String(), "stored with no dimensions")
}

package queue

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/config"
)

func noopJob(context.Context, *asynq.Task) error { return nil }

func everyHandler() JobHandlers {
	return JobHandlers{
		VirusScan:           noopJob,
		Transcription:       noopJob,
		Notification:        noopJob,
		ThumbnailGeneration: noopJob,
		EmailSend:           noopJob,
		DataExport:          noopJob,
		ContentModeration:   noopJob,
		MessageReencrypt:    noopJob,
		WaveformGeneration:  noopJob,
		VideoTranscode:      noopJob,
		OmniChatGeneration:  noopJob,
		OmniChatMemory:      noopJob,
	}
}

// The API server registered every handler but memory, so every memory job it
// took from the shared queue was retried three times and discarded -- with no
// sign at startup that anything was missing.
func TestRegisteringAHandlerSetWithAGapIsRefused(t *testing.T) {
	handlers := everyHandler()
	handlers.OmniChatMemory = nil

	err := NewWorker("127.0.0.1:0", "", 1).RegisterAllHandlers(handlers)

	require.Error(t, err)
	require.Contains(t, err.Error(), string(JobTypeOmniChatMemory))
}

func TestRegisteringEveryHandlerSucceeds(t *testing.T) {
	require.NoError(t, NewWorker("127.0.0.1:0", "", 1).RegisterAllHandlers(everyHandler()))
}

func TestMemoryExtractionFallsBackToTheStandardModel(t *testing.T) {
	cfg := &config.Config{}
	cfg.OpenRouter.StandardFallback = " google/fallback "
	require.Equal(t, "google/fallback", omniChatMemoryExtractionModel(cfg))
	cfg.OpenRouter.ExtractionModel = "google/extractor"
	require.Equal(t, "google/extractor", omniChatMemoryExtractionModel(cfg))
}

// The gate, not the function, as for generation: a main that builds the memory
// job handler itself is the copy that drifted in the first place.
//
// Only the queue's handler is checked. The server also has an HTTP handler
// for listing memories, and it builds a recall-only memory service of its own;
// neither extracts anything.
func TestBothProcessesBuildTheMemoryHandlerTheSameWay(t *testing.T) {
	for _, main := range []string{"../../cmd/server/main.go", "../../cmd/worker/main.go"} {
		source, err := os.ReadFile(main)
		require.NoError(t, err)
		text := string(source)
		require.Contains(t, text, "queue.NewOmniChatMemoryJobHandler(",
			"%s does not register the memory handler through the shared function", main)
		require.Falsef(t, strings.Contains(text, "queue.NewOmniChatMemoryHandler("),
			"%s builds the memory job handler directly; build it in NewOmniChatMemoryJobHandler so both processes agree", main)
	}
}

// Extraction records what an exchange promised and settles what it kept, but
// only with a commitment store. The standalone worker, the one process that
// extracted, never had one -- so no promise was ever recorded, and recall's
// list of what is still outstanding was always empty. The field is private to
// services, so this reads the builder, as the generation gate reads the mains.
func TestTheSharedMemoryHandlerRecordsCommitments(t *testing.T) {
	source, err := os.ReadFile("omnichat_memory_wiring.go")
	require.NoError(t, err)
	require.Contains(t, string(source), "SetCommitments(models.NewOmniChatCommitmentRepository(pool))",
		"the shared memory handler extracts without a commitment store, so promises are never recorded")
}

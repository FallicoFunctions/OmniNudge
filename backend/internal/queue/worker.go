package queue

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	zlog "github.com/rs/zerolog/log"

	"github.com/hibiken/asynq"
)

// Worker processes background jobs
type Worker struct {
	server *asynq.Server
	mux    *asynq.ServeMux
}

// JobHandler is a function that processes a specific job type
type JobHandler func(ctx context.Context, task *asynq.Task) error

// NewWorker creates a new worker instance
func NewWorker(redisAddr string, password string, concurrency int) *Worker {
	// Configure retry with exponential backoff
	// P0-002: Implement job retry logic with exponential backoff
	retryDelayFunc := asynq.RetryDelayFunc(func(n int, e error, t *asynq.Task) time.Duration {
		// Exponential backoff: 1s, 2s, 4s
		delay := time.Duration(1<<uint(n)) * time.Second
		zlog.Warn().Str("type", t.Type()).Int("attempt", n+1).Dur("retry_in", delay).Err(e).Msg("job failed, will retry")
		return delay
	})

	// Create server with configuration
	srv := asynq.NewServer(
		asynq.RedisClientOpt{
			Addr:     redisAddr,
			Password: password,
		},
		asynq.Config{
			// Number of concurrent workers (scales independently from web server)
			Concurrency: concurrency,

			// Queue priority configuration
			Queues: map[string]int{
				"critical": 6, // Process critical jobs 6x more than low
				"high":     3, // Process high priority 3x more than low
				"default":  2, // Process default 2x more than low
				"low":      1, // Baseline
			},

			// Retry configuration
			RetryDelayFunc: retryDelayFunc,

			// Error handler for logging
			ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
				logJobFailure(ctx, task, err)
			}),

			// Shutdown timeout
			ShutdownTimeout: 30 * time.Second,
		},
	)

	mux := asynq.NewServeMux()

	return &Worker{
		server: srv,
		mux:    mux,
	}
}

func logJobFailure(ctx context.Context, task *asynq.Task, err error) {
	retried := 0
	if attempts, ok := asynq.GetRetryCount(ctx); ok {
		retried = attempts
	}

	taskType := "unknown"
	taskID := "unknown"
	if task != nil {
		taskType = task.Type()
		if id, ok := asynq.GetTaskID(ctx); ok {
			taskID = id
		} else if rw := task.ResultWriter(); rw != nil {
			taskID = rw.TaskID()
		}
	}

	logger := zlog.Warn()
	message := "job execution failed"
	if maxRetry, ok := asynq.GetMaxRetry(ctx); (ok && retried >= maxRetry) || errors.Is(err, asynq.SkipRetry) {
		logger = zlog.Error()
		message = "job failed permanently"
	}

	logger.Str("type", taskType).Str("id", taskID).Err(err).Int("retried", retried).Msg(message)
}

// RegisterHandler registers a handler for a specific job type
func (w *Worker) RegisterHandler(jobType JobType, handler JobHandler) {
	w.mux.HandleFunc(string(jobType), handler)
}

// RegisterAllHandlers registers every job handler, and refuses a set with any
// missing.
//
// The API server and the standalone worker consume one queue, so a job type
// either of them lacks is a job that fails permanently whenever that process
// picks it up. Leaving a handler out used to be silent: the server went
// without the memory handler, and every memory job it took was discarded. A
// type with nothing to do registers NewUnsupportedHandler, which says so.
func (w *Worker) RegisterAllHandlers(handlers JobHandlers) error {
	all := []struct {
		jobType JobType
		handler JobHandler
	}{
		{JobTypeVirusScan, handlers.VirusScan},
		{JobTypeTranscription, handlers.Transcription},
		{JobTypeNotification, handlers.Notification},
		{JobTypeThumbnailGeneration, handlers.ThumbnailGeneration},
		{JobTypeEmailSend, handlers.EmailSend},
		{JobTypeDataExport, handlers.DataExport},
		{JobTypeContentModeration, handlers.ContentModeration},
		{JobTypeMessageReencrypt, handlers.MessageReencrypt},
		{JobTypeWaveform, handlers.WaveformGeneration},
		{JobTypeVideoTranscode, handlers.VideoTranscode},
		{JobTypeOmniChatGeneration, handlers.OmniChatGeneration},
		{JobTypeOmniChatMemory, handlers.OmniChatMemory},
	}
	var missing []string
	for _, entry := range all {
		if entry.handler == nil {
			missing = append(missing, string(entry.jobType))
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("queue: no handler registered for %s", strings.Join(missing, ", "))
	}
	for _, entry := range all {
		w.RegisterHandler(entry.jobType, entry.handler)
	}
	return nil
}

// JobHandlers groups all job handler functions
type JobHandlers struct {
	VirusScan           JobHandler
	Transcription       JobHandler
	Notification        JobHandler
	ThumbnailGeneration JobHandler
	EmailSend           JobHandler
	DataExport          JobHandler
	ContentModeration   JobHandler
	MessageReencrypt    JobHandler
	WaveformGeneration  JobHandler
	VideoTranscode      JobHandler
	OmniChatGeneration  JobHandler
	OmniChatMemory      JobHandler
}

// Start starts the worker server
func (w *Worker) Start() error {
	zlog.Info().Msg("Starting job worker...")
	return w.server.Run(w.mux)
}

// Shutdown gracefully shuts down the worker
func (w *Worker) Shutdown() {
	zlog.Info().Msg("Shutting down job worker...")
	w.server.Shutdown()
}

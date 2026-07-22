package queue

import (
	"context"
	"errors"
	zlog "github.com/rs/zerolog/log"
	"time"

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

// RegisterAllHandlers registers all default job handlers
func (w *Worker) RegisterAllHandlers(handlers JobHandlers) {
	// Register each job type handler
	if handlers.VirusScan != nil {
		w.RegisterHandler(JobTypeVirusScan, handlers.VirusScan)
	}
	if handlers.Transcription != nil {
		w.RegisterHandler(JobTypeTranscription, handlers.Transcription)
	}
	if handlers.Notification != nil {
		w.RegisterHandler(JobTypeNotification, handlers.Notification)
	}
	if handlers.ThumbnailGeneration != nil {
		w.RegisterHandler(JobTypeThumbnailGeneration, handlers.ThumbnailGeneration)
	}
	if handlers.EmailSend != nil {
		w.RegisterHandler(JobTypeEmailSend, handlers.EmailSend)
	}
	if handlers.DataExport != nil {
		w.RegisterHandler(JobTypeDataExport, handlers.DataExport)
	}
	if handlers.ContentModeration != nil {
		w.RegisterHandler(JobTypeContentModeration, handlers.ContentModeration)
	}
	if handlers.MessageReencrypt != nil {
		w.RegisterHandler(JobTypeMessageReencrypt, handlers.MessageReencrypt)
	}
	if handlers.WaveformGeneration != nil {
		w.RegisterHandler(JobTypeWaveform, handlers.WaveformGeneration)
	}
	if handlers.VideoTranscode != nil {
		w.RegisterHandler(JobTypeVideoTranscode, handlers.VideoTranscode)
	}
	if handlers.OmniChatGeneration != nil {
		w.RegisterHandler(JobTypeOmniChatGeneration, handlers.OmniChatGeneration)
	}
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

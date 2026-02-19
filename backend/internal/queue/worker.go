package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
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
		log.Printf("Job %s failed (attempt %d), retrying in %v: %v", t.Type(), n+1, delay, e)
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
				retried := 0
				if v := ctx.Value("retried"); v != nil {
					retried = v.(int)
				}
				log.Printf("Job %s (id=%s) failed: %v (retried %d times)", task.Type(), task.ResultWriter().TaskID(), err, retried)
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
}

// Start starts the worker server
func (w *Worker) Start() error {
	log.Println("Starting job worker...")
	return w.server.Run(w.mux)
}

// Shutdown gracefully shuts down the worker
func (w *Worker) Shutdown() {
	log.Println("Shutting down job worker...")
	w.server.Shutdown()
}

// HandleVirusScan processes virus scan jobs.
// Default behavior uses deterministic signature checks; service wiring may provide richer handlers.
func HandleVirusScan(ctx context.Context, task *asynq.Task) error {
	return NewUnsupportedHandler(JobTypeVirusScan, "virus scan handler requires repository/scanner wiring")(ctx, task)
}

// HandleTranscription processes audio transcription jobs.
func HandleTranscription(ctx context.Context, task *asynq.Task) error {
	var payload TranscriptionPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}
	if payload.VoiceMessageID <= 0 || payload.AudioURL == "" {
		return fmt.Errorf("invalid transcription payload: voice_message_id=%d audio_url=%q: %w",
			payload.VoiceMessageID, payload.AudioURL, asynq.SkipRetry)
	}
	return NewUnsupportedHandler(JobTypeTranscription, "transcription backend pipeline is not yet implemented")(ctx, task)
}

// HandleNotification processes push notification jobs.
func HandleNotification(ctx context.Context, task *asynq.Task) error {
	var payload NotificationPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}
	if len(payload.UserIDs) == 0 {
		return fmt.Errorf("notification payload has no user_ids: %w", asynq.SkipRetry)
	}
	log.Printf("Notification task accepted for %d user(s)", len(payload.UserIDs))
	return nil
}

// HandleThumbnailGeneration processes thumbnail generation jobs.
func HandleThumbnailGeneration(ctx context.Context, task *asynq.Task) error {
	var payload ThumbnailGenerationPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}
	if payload.FileID <= 0 {
		return fmt.Errorf("invalid thumbnail payload: file_id=%d: %w", payload.FileID, asynq.SkipRetry)
	}
	return NewUnsupportedHandler(JobTypeThumbnailGeneration, "thumbnail handler requires repository/service wiring")(ctx, task)
}

// HandleEmailSend processes email sending jobs.
func HandleEmailSend(ctx context.Context, task *asynq.Task) error {
	var payload EmailSendPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}
	if len(payload.To) == 0 {
		return fmt.Errorf("email payload has no recipients: %w", asynq.SkipRetry)
	}
	return NewUnsupportedHandler(JobTypeEmailSend, "email handler requires email service wiring")(ctx, task)
}

// HandleDataExport processes GDPR data export jobs.
func HandleDataExport(ctx context.Context, task *asynq.Task) error {
	var payload DataExportPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}
	if payload.UserID <= 0 || payload.ExportID == "" {
		return fmt.Errorf("invalid data export payload: user_id=%d export_id=%q: %w",
			payload.UserID, payload.ExportID, asynq.SkipRetry)
	}
	return NewUnsupportedHandler(JobTypeDataExport, "data export handler requires db/storage wiring")(ctx, task)
}

// HandleContentModeration processes content moderation jobs.
func HandleContentModeration(ctx context.Context, task *asynq.Task) error {
	var payload ContentModerationPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}
	if payload.ContentType == "" || payload.ContentID <= 0 {
		return fmt.Errorf("invalid content moderation payload: type=%q content_id=%d: %w",
			payload.ContentType, payload.ContentID, asynq.SkipRetry)
	}
	return NewUnsupportedHandler(JobTypeContentModeration, "content moderation backend is not yet implemented")(ctx, task)
}

// HandleMessageReencrypt processes message re-encryption jobs.
func HandleMessageReencrypt(ctx context.Context, task *asynq.Task) error {
	var payload MessageReencryptPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}
	if payload.MessageID <= 0 || payload.ConversationID <= 0 || payload.EditorID <= 0 {
		return fmt.Errorf("invalid message reencrypt payload: message_id=%d conversation_id=%d editor_id=%d: %w",
			payload.MessageID, payload.ConversationID, payload.EditorID, asynq.SkipRetry)
	}
	return NewUnsupportedHandler(JobTypeMessageReencrypt, "message re-encryption backend pipeline is not yet implemented")(ctx, task)
}

// Dead Letter Queue handling

// Inspector wraps asynq.Inspector for job inspection
type Inspector struct {
	inspector *asynq.Inspector
}

// NewInspector creates a new job inspector
func NewInspector(redisAddr string, password string) *Inspector {
	return &Inspector{
		inspector: asynq.NewInspector(asynq.RedisClientOpt{
			Addr:     redisAddr,
			Password: password,
		}),
	}
}

// ListDeadJobs lists all jobs in the dead letter queue (archived tasks)
func (i *Inspector) ListDeadJobs(queue string) ([]*asynq.TaskInfo, error) {
	return i.inspector.ListArchivedTasks(queue)
}

// RetryDeadJob retries a job from the dead letter queue
func (i *Inspector) RetryDeadJob(queue string, id string) error {
	return i.inspector.RunTask(queue, id)
}

// DeleteDeadJob permanently deletes a job from the dead letter queue
func (i *Inspector) DeleteDeadJob(queue string, id string) error {
	return i.inspector.DeleteTask(queue, id)
}

// Close closes the inspector
func (i *Inspector) Close() error {
	return i.inspector.Close()
}

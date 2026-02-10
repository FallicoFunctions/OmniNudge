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
}

// JobHandlers groups all job handler functions
type JobHandlers struct {
	VirusScan          JobHandler
	Transcription      JobHandler
	Notification       JobHandler
	ThumbnailGeneration JobHandler
	EmailSend          JobHandler
	DataExport         JobHandler
	ContentModeration  JobHandler
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

// Example job handlers (to be implemented with actual logic)

// HandleVirusScan processes virus scan jobs
func HandleVirusScan(ctx context.Context, task *asynq.Task) error {
	var payload VirusScanPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	log.Printf("Processing virus scan: file_id=%d s3_key=%s", payload.FileID, payload.S3Key)

	// TODO: Implement actual virus scanning with ClamAV
	// 1. Download file from S3
	// 2. Run ClamAV scan
	// 3. Update file status in database
	// 4. If infected: quarantine and notify user
	// 5. If clean: mark as safe

	// Placeholder: simulate work
	time.Sleep(2 * time.Second)

	log.Printf("Virus scan complete: file_id=%d status=clean", payload.FileID)
	return nil
}

// HandleTranscription processes audio transcription jobs
func HandleTranscription(ctx context.Context, task *asynq.Task) error {
	var payload TranscriptionPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	log.Printf("Processing transcription: voice_message_id=%d audio_url=%s", payload.VoiceMessageID, payload.AudioURL)

	// TODO: Implement actual transcription
	// 1. Download audio file
	// 2. Send to transcription service (Whisper, Google Speech-to-Text, etc.)
	// 3. Save transcription to database
	// 4. Notify user if enabled

	// Placeholder: simulate work
	time.Sleep(5 * time.Second)

	log.Printf("Transcription complete: voice_message_id=%d", payload.VoiceMessageID)
	return nil
}

// HandleNotification processes push notification jobs
func HandleNotification(ctx context.Context, task *asynq.Task) error {
	var payload NotificationPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	log.Printf("Processing notification: users=%d title=%s", len(payload.UserIDs), payload.Title)

	// TODO: Implement actual push notification
	// 1. Fetch device tokens for users
	// 2. Send to FCM/APNs
	// 3. Handle failures and token updates
	// 4. Log delivery status

	// Placeholder: simulate work
	time.Sleep(1 * time.Second)

	log.Printf("Notification sent: users=%d", len(payload.UserIDs))
	return nil
}

// HandleThumbnailGeneration processes thumbnail generation jobs
func HandleThumbnailGeneration(ctx context.Context, task *asynq.Task) error {
	var payload ThumbnailGenerationPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	log.Printf("Processing thumbnail generation: file_id=%d type=%s sizes=%d", payload.FileID, payload.FileType, len(payload.Sizes))

	// TODO: Implement actual thumbnail generation
	// 1. Download source file
	// 2. Generate thumbnails for each size
	// 3. Upload thumbnails to S3
	// 4. Save thumbnail URLs to database

	// Placeholder: simulate work
	time.Sleep(3 * time.Second)

	log.Printf("Thumbnail generation complete: file_id=%d", payload.FileID)
	return nil
}

// HandleEmailSend processes email sending jobs
func HandleEmailSend(ctx context.Context, task *asynq.Task) error {
	var payload EmailSendPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	log.Printf("Processing email send: to=%v subject=%s", payload.To, payload.Subject)

	// TODO: Implement actual email sending
	// 1. Render email template if needed
	// 2. Send via SMTP/SendGrid/SES
	// 3. Handle bounces
	// 4. Log delivery status

	// Placeholder: simulate work
	time.Sleep(1 * time.Second)

	log.Printf("Email sent: to=%v", payload.To)
	return nil
}

// HandleDataExport processes GDPR data export jobs
func HandleDataExport(ctx context.Context, task *asynq.Task) error {
	var payload DataExportPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	log.Printf("Processing data export: user_id=%d export_id=%s types=%v", payload.UserID, payload.ExportID, payload.DataTypes)

	// TODO: Implement actual data export
	// 1. Query all user data from database
	// 2. Decrypt encrypted data
	// 3. Export to JSON/ZIP
	// 4. Upload to S3
	// 5. Send download link via email

	// Placeholder: simulate work
	time.Sleep(10 * time.Second)

	log.Printf("Data export complete: user_id=%d export_id=%s", payload.UserID, payload.ExportID)
	return nil
}

// HandleContentModeration processes content moderation jobs
func HandleContentModeration(ctx context.Context, task *asynq.Task) error {
	var payload ContentModerationPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	log.Printf("Processing content moderation: type=%s id=%d", payload.ContentType, payload.ContentID)

	// TODO: Implement actual content moderation
	// 1. Send to moderation API (PhotoDNA, etc.)
	// 2. Flag if inappropriate
	// 3. Alert moderators if flagged
	// 4. Auto-remove if CSAM detected

	// Placeholder: simulate work
	time.Sleep(2 * time.Second)

	log.Printf("Content moderation complete: type=%s id=%d status=clean", payload.ContentType, payload.ContentID)
	return nil
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

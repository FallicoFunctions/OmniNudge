package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/hibiken/asynq"
)

// JobType defines the type of background job
type JobType string

const (
	// Job types as per P0-002 requirements
	JobTypeVirusScan           JobType = "virus_scan"
	JobTypeTranscription       JobType = "transcription"
	JobTypeNotification        JobType = "notification"
	JobTypeThumbnailGeneration JobType = "thumbnail_generation"
	JobTypeEmailSend           JobType = "email_send"         // P0-036
	JobTypeDataExport          JobType = "data_export"        // P0-016
	JobTypeContentModeration   JobType = "content_moderation" // P0-043
	JobTypeMessageReencrypt    JobType = "message_reencrypt"
)

// QueueClient wraps the Asynq client for enqueuing jobs
type QueueClient struct {
	client    *asynq.Client
	redisAddr string
	redisPass string
}

// NewQueueClient creates a new queue client for enqueuing jobs
func NewQueueClient(redisAddr string, password string) *QueueClient {
	client := asynq.NewClient(asynq.RedisClientOpt{
		Addr:     redisAddr,
		Password: password,
	})

	return &QueueClient{
		client:    client,
		redisAddr: redisAddr,
		redisPass: password,
	}
}

// Close closes the queue client
func (q *QueueClient) Close() error {
	return q.client.Close()
}

// EnqueueJob enqueues a job with the given payload
// maxRetry: number of retry attempts (default 3)
// timeout: max processing time (default 30 minutes)
func (q *QueueClient) EnqueueJob(
	ctx context.Context,
	jobType JobType,
	payload interface{},
	opts ...asynq.Option,
) (*asynq.TaskInfo, error) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	task := asynq.NewTask(string(jobType), payloadBytes, opts...)

	// Default options if not provided
	if len(opts) == 0 {
		opts = []asynq.Option{
			asynq.MaxRetry(3),               // P0-002: retry 3 times
			asynq.Timeout(30 * time.Minute), // 30 min timeout
			asynq.Retention(24 * time.Hour), // Keep completed jobs for 24h
		}
		task = asynq.NewTask(string(jobType), payloadBytes, opts...)
	}

	info, err := q.client.Enqueue(task, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to enqueue %s job: %w", jobType, err)
	}

	log.Printf("Enqueued job: type=%s id=%s queue=%s", jobType, info.ID, info.Queue)
	return info, nil
}

// EnqueueJobWithDelay enqueues a job with a delay
func (q *QueueClient) EnqueueJobWithDelay(
	ctx context.Context,
	jobType JobType,
	payload interface{},
	delay time.Duration,
) (*asynq.TaskInfo, error) {
	opts := []asynq.Option{
		asynq.ProcessIn(delay),
		asynq.MaxRetry(3),
		asynq.Timeout(30 * time.Minute),
		asynq.Retention(24 * time.Hour),
	}

	return q.EnqueueJob(ctx, jobType, payload, opts...)
}

// EnqueueJobWithPriority enqueues a job with custom priority
// priority: higher number = higher priority (default is 0)
func (q *QueueClient) EnqueueJobWithPriority(
	ctx context.Context,
	jobType JobType,
	payload interface{},
	priority int,
) (*asynq.TaskInfo, error) {
	// Asynq uses queues for priority
	// We'll use queue names: critical (priority 3), high (priority 2), default (priority 1), low (priority 0)
	var queueName string
	switch {
	case priority >= 3:
		queueName = "critical"
	case priority == 2:
		queueName = "high"
	case priority == 1:
		queueName = "default"
	default:
		queueName = "low"
	}

	opts := []asynq.Option{
		asynq.Queue(queueName),
		asynq.MaxRetry(3),
		asynq.Timeout(30 * time.Minute),
		asynq.Retention(24 * time.Hour),
	}

	return q.EnqueueJob(ctx, jobType, payload, opts...)
}

// GetJobInfo retrieves information about a job by ID
func (q *QueueClient) GetJobInfo(queue string, jobID string) (*asynq.TaskInfo, error) {
	inspector := asynq.NewInspector(asynq.RedisClientOpt{
		Addr:     q.redisAddr,
		Password: q.redisPass,
	})
	defer inspector.Close()

	return inspector.GetTaskInfo(queue, jobID)
}

// Payload types for different job types

// VirusScanPayload for virus scanning jobs
type VirusScanPayload struct {
	FileID     int    `json:"file_id"`
	FilePath   string `json:"file_path"`
	S3Key      string `json:"s3_key"`
	UploadedBy int    `json:"uploaded_by"`
}

// TranscriptionPayload for audio transcription jobs
type TranscriptionPayload struct {
	VoiceMessageID int    `json:"voice_message_id"`
	AudioURL       string `json:"audio_url"`
	UserID         int    `json:"user_id"`
	Language       string `json:"language"` // optional
}

// NotificationPayload for push notification jobs
type NotificationPayload struct {
	UserIDs []int             `json:"user_ids"`
	Title   string            `json:"title"`
	Body    string            `json:"body"`
	Data    map[string]string `json:"data,omitempty"`
	Sound   string            `json:"sound,omitempty"`
	Badge   int               `json:"badge,omitempty"`
}

// ThumbnailGenerationPayload for thumbnail generation jobs
type ThumbnailGenerationPayload struct {
	FileID      int             `json:"file_id"`
	SourceURL   string          `json:"source_url"`
	SourceS3Key string          `json:"source_s3_key"`
	FileType    string          `json:"file_type"` // "image", "video", "pdf"
	Sizes       []ThumbnailSize `json:"sizes"`
}

// ThumbnailSize specifies a thumbnail size to generate
type ThumbnailSize struct {
	Name   string `json:"name"` // e.g., "small", "medium", "large"
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// EmailSendPayload for email sending jobs
type EmailSendPayload struct {
	To          []string          `json:"to"`
	Subject     string            `json:"subject"`
	Body        string            `json:"body"`
	BodyHTML    string            `json:"body_html,omitempty"`
	From        string            `json:"from,omitempty"`
	ReplyTo     string            `json:"reply_to,omitempty"`
	Attachments []EmailAttachment `json:"attachments,omitempty"`
}

// EmailAttachment represents an email attachment
type EmailAttachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Content     []byte `json:"content"`
}

// DataExportPayload for GDPR data export jobs
type DataExportPayload struct {
	UserID         int      `json:"user_id"`
	ExportID       string   `json:"export_id"`
	DataTypes      []string `json:"data_types"` // e.g., ["messages", "files", "calls"]
	IncludeDeleted bool     `json:"include_deleted"`
}

// ContentModerationPayload for content moderation jobs
type ContentModerationPayload struct {
	ContentType string `json:"content_type"` // "image", "video", "text"
	ContentID   int    `json:"content_id"`
	ContentURL  string `json:"content_url,omitempty"`
	ContentText string `json:"content_text,omitempty"`
	ReportedBy  int    `json:"reported_by,omitempty"`
}

// MessageReencryptPayload for asynchronous message re-encryption jobs.
type MessageReencryptPayload struct {
	MessageID      int `json:"message_id"`
	ConversationID int `json:"conversation_id"`
	EditorID       int `json:"editor_id"`
}

// Helper functions for common job enqueueing patterns

// EnqueueVirusScan enqueues a virus scan job
func (q *QueueClient) EnqueueVirusScan(ctx context.Context, fileID int, filePath, s3Key string, uploadedBy int) error {
	payload := VirusScanPayload{
		FileID:     fileID,
		FilePath:   filePath,
		S3Key:      s3Key,
		UploadedBy: uploadedBy,
	}

	// High priority for virus scans
	_, err := q.EnqueueJobWithPriority(ctx, JobTypeVirusScan, payload, 2)
	return err
}

// EnqueueTranscription enqueues an audio transcription job
func (q *QueueClient) EnqueueTranscription(ctx context.Context, voiceMessageID int, audioURL string, userID int) error {
	payload := TranscriptionPayload{
		VoiceMessageID: voiceMessageID,
		AudioURL:       audioURL,
		UserID:         userID,
		Language:       "en", // default, can be detected
	}

	_, err := q.EnqueueJob(ctx, JobTypeTranscription, payload)
	return err
}

// EnqueueNotification enqueues a push notification job
func (q *QueueClient) EnqueueNotification(ctx context.Context, userIDs []int, title, body string) error {
	payload := NotificationPayload{
		UserIDs: userIDs,
		Title:   title,
		Body:    body,
	}

	// Medium-high priority for notifications
	_, err := q.EnqueueJobWithPriority(ctx, JobTypeNotification, payload, 2)
	return err
}

// EnqueueThumbnailGeneration enqueues a thumbnail generation job
func (q *QueueClient) EnqueueThumbnailGeneration(ctx context.Context, fileID int, sourceURL, fileType string) error {
	// Standard thumbnail sizes
	sizes := []ThumbnailSize{
		{Name: "small", Width: 200, Height: 200},
		{Name: "medium", Width: 800, Height: 600},
	}

	payload := ThumbnailGenerationPayload{
		FileID:    fileID,
		SourceURL: sourceURL,
		FileType:  fileType,
		Sizes:     sizes,
	}

	_, err := q.EnqueueJob(ctx, JobTypeThumbnailGeneration, payload)
	return err
}

// EnqueueEmail enqueues an email sending job
func (q *QueueClient) EnqueueEmail(ctx context.Context, to []string, subject, body string) error {
	payload := EmailSendPayload{
		To:      to,
		Subject: subject,
		Body:    body,
	}

	// Medium priority for emails
	_, err := q.EnqueueJobWithPriority(ctx, JobTypeEmailSend, payload, 1)
	return err
}

// EnqueueDataExport enqueues a GDPR data export job
func (q *QueueClient) EnqueueDataExport(ctx context.Context, payload DataExportPayload) error {
	// Low priority, can be slow
	_, err := q.EnqueueJobWithPriority(ctx, JobTypeDataExport, payload, 0)
	return err
}

// EnqueueMessageReencrypt enqueues a message re-encryption job.
func (q *QueueClient) EnqueueMessageReencrypt(ctx context.Context, payload MessageReencryptPayload) error {
	_, err := q.EnqueueJob(ctx, JobTypeMessageReencrypt, payload)
	return err
}

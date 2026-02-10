package queue

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
	"github.com/omninudge/backend/internal/services"
)

// NewEmailHandler creates an email sending job handler
func NewEmailHandler(emailService *services.EmailService) JobHandler {
	return func(ctx context.Context, task *asynq.Task) error {
		var payload EmailSendPayload
		if err := json.Unmarshal(task.Payload(), &payload); err != nil {
			return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
		}

		// Use HTML body if provided, otherwise just body
		htmlBody := payload.BodyHTML
		body := payload.Body
		if body == "" && htmlBody != "" {
			// If only HTML provided, use it for both
			body = "Please view this email in an HTML-capable email client."
		}

		// Send email using email service
		err := emailService.SendEmail(payload.To, payload.Subject, body, htmlBody)
		if err != nil {
			return fmt.Errorf("failed to send email: %w", err)
		}

		return nil
	}
}

package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/hibiken/asynq"
)

// NewUnsupportedHandler returns a handler that records a clear reason and skips retries.
func NewUnsupportedHandler(jobType JobType, reason string) JobHandler {
	return func(ctx context.Context, task *asynq.Task) error {
		if task.Type() != string(jobType) {
			return fmt.Errorf("unexpected task type %q for unsupported handler %q: %w", task.Type(), jobType, asynq.SkipRetry)
		}

		var payload map[string]any
		if err := json.Unmarshal(task.Payload(), &payload); err != nil {
			return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
		}

		log.Printf("Skipping unsupported job %s: reason=%s payload=%v", jobType, reason, payload)
		return fmt.Errorf("job %s unsupported: %s: %w", jobType, reason, asynq.SkipRetry)
	}
}

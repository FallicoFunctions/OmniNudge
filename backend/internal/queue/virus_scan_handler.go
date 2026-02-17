package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/hibiken/asynq"
	"github.com/omninudge/backend/internal/api/middleware"
)

// NewVirusScanHandler creates a practical file safety validation handler.
// This is not a full AV engine, but it performs deterministic signature checks.
func NewVirusScanHandler() JobHandler {
	return func(ctx context.Context, task *asynq.Task) error {
		var payload VirusScanPayload
		if err := json.Unmarshal(task.Payload(), &payload); err != nil {
			return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
		}
		if payload.FileID <= 0 {
			return fmt.Errorf("invalid file_id=%d: %w", payload.FileID, asynq.SkipRetry)
		}
		if payload.FilePath == "" {
			return fmt.Errorf("missing file_path for file_id=%d: %w", payload.FileID, asynq.SkipRetry)
		}

		f, err := os.Open(payload.FilePath)
		if err != nil {
			return fmt.Errorf("failed to open file for scanning: %w", err)
		}
		defer f.Close()

		var sniff [512]byte
		n, err := io.ReadFull(f, sniff[:])
		if err != nil && err != io.ErrUnexpectedEOF {
			return fmt.Errorf("failed to read file for scanning: %w", err)
		}
		contentType := http.DetectContentType(sniff[:n])

		if !middleware.ValidateNoSuspiciousSignatures(sniff[:n], contentType) {
			return fmt.Errorf("suspicious signatures detected for file_id=%d: %w", payload.FileID, asynq.SkipRetry)
		}

		log.Printf("Virus scan checks passed: file_id=%d type=%s", payload.FileID, contentType)
		return nil
	}
}

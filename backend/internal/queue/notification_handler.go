package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/hibiken/asynq"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/services"
)

// NewNotificationHandler creates a push notification queue handler.
func NewNotificationHandler(
	tokenRepo ports.DeviceTokenRepository,
	firebase *services.FirebaseService,
) JobHandler {
	return func(ctx context.Context, task *asynq.Task) error {
		var payload NotificationPayload
		if err := json.Unmarshal(task.Payload(), &payload); err != nil {
			return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
		}
		if len(payload.UserIDs) == 0 {
			return fmt.Errorf("notification payload has no user_ids: %w", asynq.SkipRetry)
		}
		if payload.Title == "" && payload.Body == "" {
			return fmt.Errorf("notification payload missing title/body: %w", asynq.SkipRetry)
		}
		if tokenRepo == nil || firebase == nil {
			log.Printf("Skipping push notification send: dependencies unavailable (users=%v)", payload.UserIDs)
			return nil
		}

		tokens := make([]string, 0, 8)
		for _, userID := range payload.UserIDs {
			userTokens, err := tokenRepo.GetByUserID(ctx, userID)
			if err != nil {
				log.Printf("Failed to get tokens for user %d: %v", userID, err)
				continue
			}
			for _, t := range userTokens {
				if t.Token != "" {
					tokens = append(tokens, t.Token)
				}
			}
		}

		if len(tokens) == 0 {
			log.Printf("No push tokens found for users=%v", payload.UserIDs)
			return nil
		}

		if len(tokens) == 1 {
			if err := firebase.SendNotification(ctx, tokens[0], payload.Title, payload.Body, payload.Data); err != nil {
				return fmt.Errorf("failed to send push notification: %w", err)
			}
			return nil
		}

		if _, err := firebase.SendMulticast(ctx, tokens, payload.Title, payload.Body, payload.Data); err != nil {
			return fmt.Errorf("failed to send multicast push notification: %w", err)
		}
		return nil
	}
}

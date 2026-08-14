package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/hibiken/asynq"
	zlog "github.com/rs/zerolog/log"
)

// OmniChatMemoryExtractor extracts durable memories for one conversation.
type OmniChatMemoryExtractor interface {
	ExtractForConversation(ctx context.Context, conversationID, ownerUserID int) error
}

// OmniChatMemoryConversationOwner resolves who owns a conversation.
//
// The queue payload carries only the conversation id, so ownership is resolved
// here from the database rather than trusted from Redis. Extraction writes
// private, user-scoped memory, and an owner supplied by the payload would be an
// owner an attacker could choose.
type OmniChatMemoryConversationOwner interface {
	GetOwnerUserID(ctx context.Context, conversationID int) (int, error)
}

// NewOmniChatMemoryHandler builds the handler for JobTypeOmniChatMemory.
func NewOmniChatMemoryHandler(
	extractor OmniChatMemoryExtractor,
	owners OmniChatMemoryConversationOwner,
) JobHandler {
	return func(ctx context.Context, task *asynq.Task) error {
		var payload OmniChatMemoryPayload
		if err := json.Unmarshal(task.Payload(), &payload); err != nil {
			// A payload this malformed will never parse; retrying wastes the
			// queue, so it is dropped rather than returned.
			zlog.Error().Err(err).Msg("omnichat memory: unparseable payload, dropping")
			return fmt.Errorf("omnichat memory: decode payload: %w: %w", err, asynq.SkipRetry)
		}
		if payload.ConversationID < 1 {
			return fmt.Errorf("omnichat memory: invalid conversation id: %w", asynq.SkipRetry)
		}
		if extractor == nil || owners == nil {
			return errors.New("omnichat memory: handler is not configured")
		}

		ownerUserID, err := owners.GetOwnerUserID(ctx, payload.ConversationID)
		if err != nil {
			return fmt.Errorf("omnichat memory: resolve conversation owner: %w", err)
		}
		if ownerUserID < 1 {
			// The conversation was deleted between enqueue and run. Nothing to
			// remember, and nothing to retry.
			return nil
		}

		if err := extractor.ExtractForConversation(ctx, payload.ConversationID, ownerUserID); err != nil {
			return fmt.Errorf("omnichat memory: extract conversation %d: %w", payload.ConversationID, err)
		}
		return nil
	}
}

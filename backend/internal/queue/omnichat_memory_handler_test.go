package queue

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"
)

type stubMemoryExtractor struct {
	calls           int
	sawConversation int
	sawOwner        int
	err             error
}

func (s *stubMemoryExtractor) ExtractForConversation(_ context.Context, conversationID, ownerUserID int) error {
	s.calls++
	s.sawConversation = conversationID
	s.sawOwner = ownerUserID
	return s.err
}

type stubMemoryOwners struct {
	ownerUserID int
	err         error
}

func (s *stubMemoryOwners) GetOwnerUserID(context.Context, int) (int, error) {
	return s.ownerUserID, s.err
}

func memoryTask(t *testing.T, payload any) *asynq.Task {
	t.Helper()
	encoded, err := json.Marshal(payload)
	require.NoError(t, err)
	return asynq.NewTask(string(JobTypeOmniChatMemory), encoded)
}

func TestOmniChatMemoryHandlerResolvesOwnerFromDatabase(t *testing.T) {
	extractor := &stubMemoryExtractor{}
	// The payload carries no owner. Ownership must come from the database, or a
	// forged queue entry could write memory into another user's private tier.
	owners := &stubMemoryOwners{ownerUserID: 77}
	handler := NewOmniChatMemoryHandler(extractor, owners)

	require.NoError(t, handler(context.Background(), memoryTask(t, OmniChatMemoryPayload{ConversationID: 12})))
	require.Equal(t, 1, extractor.calls)
	require.Equal(t, 12, extractor.sawConversation)
	require.Equal(t, 77, extractor.sawOwner)
}

func TestOmniChatMemoryHandlerSkipsDeletedConversation(t *testing.T) {
	extractor := &stubMemoryExtractor{}
	handler := NewOmniChatMemoryHandler(extractor, &stubMemoryOwners{ownerUserID: 0})

	// Deleted between enqueue and run. There is nothing to remember and nothing
	// to retry, so this must succeed rather than churn the queue.
	require.NoError(t, handler(context.Background(), memoryTask(t, OmniChatMemoryPayload{ConversationID: 12})))
	require.Zero(t, extractor.calls)
}

func TestOmniChatMemoryHandlerDoesNotRetryUnparseablePayload(t *testing.T) {
	handler := NewOmniChatMemoryHandler(&stubMemoryExtractor{}, &stubMemoryOwners{ownerUserID: 1})

	err := handler(context.Background(), asynq.NewTask(string(JobTypeOmniChatMemory), []byte("{not json")))
	require.Error(t, err)
	require.ErrorIs(t, err, asynq.SkipRetry, "a payload that can never parse must not be retried")
}

func TestOmniChatMemoryHandlerRejectsInvalidConversationID(t *testing.T) {
	handler := NewOmniChatMemoryHandler(&stubMemoryExtractor{}, &stubMemoryOwners{ownerUserID: 1})

	err := handler(context.Background(), memoryTask(t, OmniChatMemoryPayload{ConversationID: 0}))
	require.Error(t, err)
	require.ErrorIs(t, err, asynq.SkipRetry)
}

func TestOmniChatMemoryHandlerPropagatesExtractionFailure(t *testing.T) {
	extractor := &stubMemoryExtractor{err: errors.New("model unavailable")}
	handler := NewOmniChatMemoryHandler(extractor, &stubMemoryOwners{ownerUserID: 4})

	// A transient failure must surface so Asynq retries with backoff.
	err := handler(context.Background(), memoryTask(t, OmniChatMemoryPayload{ConversationID: 3}))
	require.Error(t, err)
	require.NotErrorIs(t, err, asynq.SkipRetry)
}

package models_test

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func newOmniChatRequestIdempotencyRepo(t *testing.T) (*models.OmniChatRequestIdempotencyRepository, *models.User, *database.DB) {
	t.Helper()
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))
	user := &models.User{Username: "request_idempotency_user", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	return models.NewOmniChatRequestIdempotencyRepository(db.Pool), user, db
}

func TestOmniChatRequestIdempotencyReplaysAndRejectsPayloadReuse(t *testing.T) {
	repo, user, _ := newOmniChatRequestIdempotencyRepo(t)
	ctx := context.Background()
	requestID := uuid.New()
	hash := models.OmniChatRequestPayloadHash([]byte(`{"content":"hello"}`))
	claim, err := repo.Begin(ctx, user.ID, requestID, "chat_send", "conversation:7", hash)
	require.NoError(t, err)
	require.False(t, claim.Replay)
	require.NoError(t, repo.Complete(ctx, user.ID, requestID, json.RawMessage(`{"id":17,"content":"hi"}`)))

	replay, err := repo.Begin(ctx, user.ID, requestID, "chat_send", "conversation:7", hash)
	require.NoError(t, err)
	require.True(t, replay.Replay)
	require.JSONEq(t, `{"id":17,"content":"hi"}`, string(replay.Response))

	_, err = repo.Begin(ctx, user.ID, requestID, "chat_send", "conversation:7", models.OmniChatRequestPayloadHash([]byte(`{"content":"other"}`)))
	require.ErrorIs(t, err, models.ErrOmniChatRequestConflict)
}

func TestOmniChatRequestIdempotencySerializesConversationTurns(t *testing.T) {
	repo, user, _ := newOmniChatRequestIdempotencyRepo(t)
	ctx := context.Background()
	first := uuid.New()
	_, err := repo.Begin(ctx, user.ID, first, "chat_send", "conversation:7", models.OmniChatRequestPayloadHash([]byte(`{"content":"one"}`)))
	require.NoError(t, err)
	_, err = repo.Begin(ctx, user.ID, uuid.New(), "chat_regenerate", "conversation:7", models.OmniChatRequestPayloadHash([]byte(`{"message_id":4}`)))
	require.ErrorIs(t, err, models.ErrOmniChatConversationBusy)
}

func TestOmniChatRequestIdempotencyConcurrentDuplicateClaimsOnlyOnce(t *testing.T) {
	repo, user, _ := newOmniChatRequestIdempotencyRepo(t)
	ctx := context.Background()
	requestID := uuid.New()
	hash := models.OmniChatRequestPayloadHash([]byte(`{"content":"hello"}`))
	start := make(chan struct{})
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := repo.Begin(ctx, user.ID, requestID, "chat_send", "conversation:8", hash)
			results <- err
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	var claimed, inProgress int
	for err := range results {
		if err == nil {
			claimed++
		} else if errors.Is(err, models.ErrOmniChatRequestInProgress) {
			inProgress++
		} else {
			t.Fatalf("unexpected concurrent claim error: %v", err)
		}
	}
	require.Equal(t, 1, claimed)
	require.Equal(t, 1, inProgress)
}

func TestOmniChatFreeTierMessageCompletesRequestAtomically(t *testing.T) {
	repo, user, db := newOmniChatRequestIdempotencyRepo(t)
	ctx := context.Background()
	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas(slug,name,category,system_prompt,visibility,source_format,is_active)
		VALUES('request-idempotency-persona','Request Idempotency','original','Stay in character.','public','native',TRUE)
		RETURNING id
	`).Scan(&personaID))
	conversation, err := models.NewBotConversationRepository(db.Pool).Create(ctx, user.ID, personaID, nil, nil)
	require.NoError(t, err)
	requestID := uuid.New()
	hash := models.OmniChatRequestPayloadHash([]byte(`{"content":"hello"}`))
	resource := "conversation:" + strconv.Itoa(conversation.ID)
	_, err = repo.Begin(ctx, user.ID, requestID, "chat_send", resource, hash)
	require.NoError(t, err)
	message, err := models.NewBotMessageRepository(db.Pool).CreateWithBilling(
		ctx, conversation.ID, models.BotMessageRoleAssistant, "I hear you.", true, nil, nil,
		&models.OmniChatRequestCompletion{UserID: user.ID, RequestID: requestID},
	)
	require.NoError(t, err)
	require.NotNil(t, message.RequestID)
	require.Equal(t, requestID, *message.RequestID)
	replay, err := repo.Begin(ctx, user.ID, requestID, "chat_send", resource, hash)
	require.NoError(t, err)
	var returned models.BotMessage
	require.NoError(t, json.Unmarshal(replay.Response, &returned))
	require.Equal(t, message.ID, returned.ID)
	require.NotNil(t, returned.RequestID)
	require.Equal(t, requestID, *returned.RequestID)
	require.True(t, returned.Failed)
}

func TestOmniChatRequestIdempotencyAllowsStaleRequestRecovery(t *testing.T) {
	repo, user, db := newOmniChatRequestIdempotencyRepo(t)
	ctx := context.Background()
	first := uuid.New()
	_, err := repo.Begin(ctx, user.ID, first, "chat_send", "conversation:9", models.OmniChatRequestPayloadHash([]byte(`{"content":"one"}`)))
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `UPDATE omnichat_request_idempotency SET updated_at=$3 WHERE user_id=$1 AND client_request_id=$2`, user.ID, first, time.Now().Add(-3*time.Minute))
	require.NoError(t, err)
	_, err = repo.Begin(ctx, user.ID, uuid.New(), "chat_send", "conversation:9", models.OmniChatRequestPayloadHash([]byte(`{"content":"two"}`)))
	require.NoError(t, err)
}

func TestOmniChatRequestRetryReusesPreviouslyPersistedUserTurn(t *testing.T) {
	repo, user, db := newOmniChatRequestIdempotencyRepo(t)
	ctx := context.Background()
	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas(slug,name,category,system_prompt,visibility,source_format,is_active)
		VALUES('retry-user-turn-persona','Retry User Turn','original','Stay in character.','public','native',TRUE)
		RETURNING id
	`).Scan(&personaID))
	conversation, err := models.NewBotConversationRepository(db.Pool).Create(ctx, user.ID, personaID, nil, nil)
	require.NoError(t, err)
	requestID := uuid.New()
	hash := models.OmniChatRequestPayloadHash([]byte(`{"content":"retry me"}`))
	resource := "conversation:" + strconv.Itoa(conversation.ID)
	_, err = repo.Begin(ctx, user.ID, requestID, "chat_send", resource, hash)
	require.NoError(t, err)
	messages := models.NewBotMessageRepository(db.Pool)
	first, reused, err := messages.CreateUserTurnWithRequestID(ctx, conversation.ID, "retry me", requestID)
	require.NoError(t, err)
	require.False(t, reused)
	// Simulate a provider/persistence failure after the user turn has committed.
	require.NoError(t, repo.Fail(ctx, user.ID, requestID))
	_, err = repo.Begin(ctx, user.ID, requestID, "chat_send", resource, hash)
	require.NoError(t, err)
	second, reused, err := messages.CreateUserTurnWithRequestID(ctx, conversation.ID, "retry me", requestID)
	require.NoError(t, err)
	require.True(t, reused)
	require.Equal(t, first.ID, second.ID)
	var count int
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM bot_messages WHERE conversation_id=$1 AND role='user'`, conversation.ID).Scan(&count))
	require.Equal(t, 1, count)
}

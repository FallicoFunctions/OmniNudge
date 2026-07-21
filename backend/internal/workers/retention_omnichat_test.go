package workers

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

type liveCallEnderFake struct {
	sessions []string
	err      error
}

func (f *liveCallEnderFake) EndConversation(_ context.Context, sessionID string) error {
	f.sessions = append(f.sessions, sessionID)
	return f.err
}

func TestRetentionWorkerDeletesExpiredOmniChatSpeechFromStorageAndDatabase(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &models.User{Username: "voice_retention_user", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO bot_personas(slug,name,category,system_prompt,visibility,source_format,is_active) VALUES('voice-retention','Voice Retention','original','Stay in character.','public','native',TRUE) RETURNING id`).Scan(&personaID))
	conversation, err := models.NewBotConversationRepository(db.Pool).Create(ctx, user.ID, personaID, nil, nil)
	require.NoError(t, err)
	message, err := models.NewBotMessageRepository(db.Pool).Create(ctx, conversation.ID, models.BotMessageRoleAssistant, "Hello", false)
	require.NoError(t, err)

	voiceStorage, err := services.NewLocalStorageService(t.TempDir(), "http://voice.test")
	require.NoError(t, err)
	const key = "omnichat/speech/expired.mp3"
	_, err = voiceStorage.Upload(ctx, key, strings.NewReader("audio"), "audio/mpeg")
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `INSERT INTO omnichat_speech_audio(id,owner_user_id,persona_id,message_id,text_hash,voice_config_hash,storage_path,file_size,expires_at) VALUES(gen_random_uuid(),$1,$2,$3,repeat('a',64),repeat('b',64),$4,5,NOW()-INTERVAL '1 hour')`, user.ID, personaID, message.ID, key)
	require.NoError(t, err)

	worker := NewRetentionWorker(db.Pool, nil, nil, config.RetentionConfig{}).SetVoiceStorage(voiceStorage)
	worker.cleanupExpiredOmniChatSpeech(ctx)

	var remaining int
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM omnichat_speech_audio WHERE message_id=$1`, message.ID).Scan(&remaining))
	require.Zero(t, remaining)
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM omnichat_speech_deletion_queue WHERE storage_path=$1`, key).Scan(&remaining))
	require.Zero(t, remaining)
	_, err = voiceStorage.Download(ctx, key)
	require.Error(t, err)
}

func TestRetentionWorkerDrainsSpeechObjectOutboxAfterMessageCascade(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &models.User{Username: "speech_outbox_user", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO bot_personas(slug,name,category,system_prompt,visibility,source_format,is_active) VALUES('speech-outbox','Speech Outbox','original','Stay in character.','public','native',TRUE) RETURNING id`).Scan(&personaID))
	conversation, err := models.NewBotConversationRepository(db.Pool).Create(ctx, user.ID, personaID, nil, nil)
	require.NoError(t, err)
	message, err := models.NewBotMessageRepository(db.Pool).Create(ctx, conversation.ID, models.BotMessageRoleAssistant, "Hello", false)
	require.NoError(t, err)

	voiceStorage, err := services.NewLocalStorageService(t.TempDir(), "http://voice.test")
	require.NoError(t, err)
	const key = "omnichat/speech/7/11/aaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-123e4567-e89b-12d3-a456-426614174000.mp3"
	_, err = voiceStorage.Upload(ctx, key, strings.NewReader("audio"), "audio/mpeg")
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `INSERT INTO omnichat_speech_audio(id,owner_user_id,persona_id,message_id,text_hash,voice_config_hash,storage_path,file_size) VALUES(gen_random_uuid(),$1,$2,$3,repeat('a',64),repeat('b',64),$4,5)`, user.ID, personaID, message.ID, key)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `DELETE FROM bot_messages WHERE id=$1`, message.ID)
	require.NoError(t, err)
	var queued int
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM omnichat_speech_deletion_queue WHERE storage_path=$1`, key).Scan(&queued))
	require.Equal(t, 1, queued)

	worker := NewRetentionWorker(db.Pool, nil, nil, config.RetentionConfig{}).SetVoiceStorage(voiceStorage)
	worker.cleanupDeletedOmniChatSpeech(ctx)

	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM omnichat_speech_deletion_queue WHERE storage_path=$1`, key).Scan(&queued))
	require.Zero(t, queued)
	_, err = voiceStorage.Download(ctx, key)
	require.Error(t, err)
}

func TestRetentionWorkerDoesNotSpinOnFullInvalidSpeechOutboxBatch(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_speech_deletion_queue(storage_path)
		SELECT 'not-omnichat-speech/' || generate_series::text
		FROM generate_series(1, 500)
	`)
	require.NoError(t, err)
	voiceStorage, err := services.NewLocalStorageService(t.TempDir(), "http://voice.test")
	require.NoError(t, err)
	worker := NewRetentionWorker(db.Pool, nil, nil, config.RetentionConfig{}).SetVoiceStorage(voiceStorage)
	done := make(chan struct{})
	go func() {
		worker.cleanupDeletedOmniChatSpeech(ctx)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("speech deletion outbox drain spun on a full invalid batch")
	}
	var remaining int
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM omnichat_speech_deletion_queue`).Scan(&remaining))
	require.Equal(t, 500, remaining)
}

func TestRetentionWorkerEndsAndClearsAbandonedOmniChatProviderSession(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &models.User{Username: "call_retention_user", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO bot_personas(slug,name,category,system_prompt,visibility,source_format,is_active) VALUES('call-retention','Call Retention','original','Stay in character.','public','native',TRUE) RETURNING id`).Scan(&personaID))
	conversation, err := models.NewBotConversationRepository(db.Pool).Create(ctx, user.ID, personaID, nil, nil)
	require.NoError(t, err)
	callRepository := models.NewOmniChatVoiceRepository(db.Pool)
	call, err := callRepository.StartCallOwned(ctx, user.ID, conversation.ID, "video")
	require.NoError(t, err)
	attached, err := callRepository.AttachCallProviderOwned(ctx, call.ID, user.ID, "tavus", "abandoned-provider-call")
	require.NoError(t, err)
	require.True(t, attached)
	require.NoError(t, db.Pool.QueryRow(ctx, `UPDATE omnichat_call_sessions SET last_activity_at=NOW()-INTERVAL '3 hours' WHERE id=$1 RETURNING id`, call.ID).Scan(&call.ID))

	ender := &liveCallEnderFake{}
	worker := NewRetentionWorker(db.Pool, nil, nil, config.RetentionConfig{}).SetLiveCallEnder(ender)
	worker.cleanupAbandonedOmniChatCalls(ctx)

	require.Equal(t, []string{"abandoned-provider-call"}, ender.sessions)
	var status string
	var providerSessionID *string
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT status,provider_session_id FROM omnichat_call_sessions WHERE id=$1`, call.ID).Scan(&status, &providerSessionID))
	require.Equal(t, "ended", status)
	require.Nil(t, providerSessionID)
}

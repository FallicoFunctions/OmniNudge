package workers

import (
	"context"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
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

type deletionRecordingStorage struct {
	deleted []string
}

func (*deletionRecordingStorage) Upload(context.Context, string, io.Reader, string) (string, error) {
	return "", nil
}
func (*deletionRecordingStorage) Download(context.Context, string) (io.ReadCloser, error) {
	return nil, nil
}
func (s *deletionRecordingStorage) Delete(_ context.Context, key string) error {
	s.deleted = append(s.deleted, key)
	return nil
}
func (*deletionRecordingStorage) GetSignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}
func (*deletionRecordingStorage) List(context.Context, string) ([]string, error) {
	return nil, nil
}
func (*deletionRecordingStorage) GeneratePresignedPutURL(context.Context, string, string, time.Duration) (string, error) {
	return "", nil
}
func (*deletionRecordingStorage) PublicURL(string) string {
	return ""
}
func (*deletionRecordingStorage) GetObjectSize(context.Context, string) (int64, error) {
	return 0, nil
}

func (f *liveCallEnderFake) EndConversation(_ context.Context, sessionID string) error {
	f.sessions = append(f.sessions, sessionID)
	return f.err
}

func TestRetentionWorkerDrainsGeneratedMediaDeletionOutbox(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	storage, err := services.NewLocalStorageService(t.TempDir(), "http://media.test")
	require.NoError(t, err)
	key := "omnichat/generated/7/" + uuid.NewString() + ".png"
	_, err = storage.Upload(ctx, key, strings.NewReader("image"), "image/png")
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_media_deletion_queue(storage_path, owner_user_id) VALUES($1, 7)
	`, key)
	require.NoError(t, err)

	worker := NewRetentionWorker(db.Pool, nil, storage, config.RetentionConfig{})
	worker.cleanupDeletedOmniChatMedia(ctx)

	var remaining int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM omnichat_media_deletion_queue WHERE storage_path=$1
	`, key).Scan(&remaining))
	require.Zero(t, remaining)
	_, err = storage.Download(ctx, key)
	require.Error(t, err)
}

func TestRetentionWorkerDeadLettersInvalidMediaPathWithoutStarvingValidDeletion(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	storage, err := services.NewLocalStorageService(t.TempDir(), "http://media.test")
	require.NoError(t, err)
	validKey := "omnichat/generated/7/" + uuid.NewString() + ".png"
	_, err = storage.Upload(ctx, validKey, strings.NewReader("image"), "image/png")
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_media_deletion_queue(storage_path, owner_user_id)
		VALUES('not-an-omnichat-object', 7), ($1, 7)
	`, validKey)
	require.NoError(t, err)

	worker := NewRetentionWorker(db.Pool, nil, storage, config.RetentionConfig{})
	worker.cleanupDeletedOmniChatMedia(ctx)

	var status, errorCode string
	var attempts int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT status,last_error_code,attempts
		FROM omnichat_media_deletion_queue
		WHERE storage_path='not-an-omnichat-object'
	`).Scan(&status, &errorCode, &attempts))
	require.Equal(t, "dead_letter", status)
	require.Equal(t, "invalid_storage_path", errorCode)
	require.Equal(t, 1, attempts)
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM omnichat_media_deletion_queue WHERE storage_path=$1
	`, validKey).Scan(&attempts))
	require.Zero(t, attempts)
}

func TestRetentionWorkerRefundsOrphanedCreditReservation(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &models.User{Username: "orphaned_credit_user", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	credits := models.NewOmniCreditsRepository(db.Pool)
	_, err = credits.CreditPurchased(ctx, user.ID, uuid.New(), 20)
	require.NoError(t, err)
	operationID := uuid.New()
	_, err = credits.ReserveUsage(ctx, user.ID, operationID, models.OmniCreditsUsageImage, 8)
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `
		UPDATE omnicredits_usage_reservations
		SET created_at=NOW()-INTERVAL '3 hours', updated_at=NOW()-INTERVAL '3 hours'
		WHERE user_id=$1 AND operation_id=$2
	`, user.ID, operationID)
	require.NoError(t, err)

	worker := NewRetentionWorker(db.Pool, nil, nil, config.RetentionConfig{})
	worker.cleanupOrphanedOmniCreditsReservations(ctx)

	wallet, err := credits.GetWallet(ctx, user.ID)
	require.NoError(t, err)
	require.Equal(t, int64(20), wallet.TotalBalance)
	var status string
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT status FROM omnicredits_usage_reservations
		WHERE user_id=$1 AND operation_id=$2
	`, user.ID, operationID).Scan(&status))
	require.Equal(t, models.OmniCreditsReservationRefunded, status)
}

func TestRetentionWorkerFailsAndRefundsStaleGenerationReservations(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &models.User{Username: "stale_generation_credit_user", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas(
			slug,name,category,system_prompt,visibility,source_format,is_active
		) VALUES(
			'stale-generation-credit','Stale Generation Credit','original',
			'Stay in character.','public','native',TRUE
		) RETURNING id
	`).Scan(&personaID))

	credits := models.NewOmniCreditsRepository(db.Pool)
	_, err = credits.CreditPurchased(ctx, user.ID, uuid.New(), 40)
	require.NoError(t, err)
	mediaRepo := models.NewOmniChatMediaRepository(db.Pool)

	testCases := []struct {
		name          string
		initialStatus models.OmniChatGenerationStatus
		staleFor      time.Duration
		errorCode     string
	}{
		{
			name:          "queued lease",
			initialStatus: models.OmniChatGenerationStatusQueued,
			staleFor:      3 * time.Hour,
			errorCode:     "queue_stale",
		},
		{
			name:          "provider lease",
			initialStatus: models.OmniChatGenerationStatusRunning,
			staleFor:      25 * time.Hour,
			errorCode:     "provider_stale",
		},
	}

	type expectedJob struct {
		id          uuid.UUID
		operationID uuid.UUID
		errorCode   string
	}
	expected := make([]expectedJob, 0, len(testCases))
	for _, testCase := range testCases {
		operationID := uuid.New()
		_, err = credits.ReserveUsage(ctx, user.ID, operationID, models.OmniCreditsUsageImage, 8)
		require.NoError(t, err)
		job, createErr := mediaRepo.CreateGenerationJob(ctx, user.ID, models.OmniChatGenerationRequest{
			Kind:               models.OmniChatMediaKindImage,
			Mode:               models.OmniChatGenerationModeCreate,
			PersonaID:          personaID,
			Prompt:             testCase.name,
			EffectivePrompt:    testCase.name,
			AspectRatio:        "1:1",
			BillingOperationID: &operationID,
		}, "test")
		require.NoError(t, createErr)
		if testCase.initialStatus == models.OmniChatGenerationStatusRunning {
			marked, markErr := mediaRepo.MarkGenerationJobRunning(ctx, job.ID, "provider-job")
			require.NoError(t, markErr)
			require.True(t, marked)
		}
		_, err = db.Pool.Exec(ctx, `
			UPDATE omnichat_generation_jobs
			SET last_activity_at=$2
			WHERE id=$1
		`, job.ID, time.Now().Add(-testCase.staleFor))
		require.NoError(t, err)
		_, err = db.Pool.Exec(ctx, `
			UPDATE omnicredits_usage_reservations
			SET created_at=NOW()-INTERVAL '30 minutes',
			    updated_at=NOW()-INTERVAL '30 minutes'
			WHERE user_id=$1 AND operation_id=$2
		`, user.ID, operationID)
		require.NoError(t, err)
		expected = append(expected, expectedJob{
			id: job.ID, operationID: operationID, errorCode: testCase.errorCode,
		})
	}

	worker := NewRetentionWorker(db.Pool, nil, nil, config.RetentionConfig{})
	worker.cleanupOrphanedOmniCreditsReservations(ctx)

	for _, item := range expected {
		var jobStatus, errorCode, reservationStatus string
		require.NoError(t, db.Pool.QueryRow(ctx, `
			SELECT status,error_code
			FROM omnichat_generation_jobs
			WHERE id=$1
		`, item.id).Scan(&jobStatus, &errorCode))
		require.Equal(t, string(models.OmniChatGenerationStatusFailed), jobStatus)
		require.Equal(t, item.errorCode, errorCode)
		require.NoError(t, db.Pool.QueryRow(ctx, `
			SELECT status
			FROM omnicredits_usage_reservations
			WHERE user_id=$1 AND operation_id=$2
		`, user.ID, item.operationID).Scan(&reservationStatus))
		require.Equal(t, models.OmniCreditsReservationRefunded, reservationStatus)
	}
	wallet, err := credits.GetWallet(ctx, user.ID)
	require.NoError(t, err)
	require.Equal(t, int64(40), wallet.TotalBalance)
}

func TestRetentionWorkerDrainsUserMediaDeletionOutbox(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &models.User{Username: "media_outbox_user", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	storage, err := services.NewLocalStorageService(t.TempDir(), "http://media.test")
	require.NoError(t, err)
	key := fmt.Sprintf("%d/%s.png", user.ID, uuid.NewString())
	_, err = storage.Upload(ctx, key, strings.NewReader("image"), "image/png")
	require.NoError(t, err)
	var mediaFileID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO media_files(
			user_id,filename,original_filename,file_type,file_size,storage_url,
			storage_path,storage_object_key
		) VALUES($1,'queued.png','queued.png','image/png',5,'http://media.test/queued.png',
		         $2,$3)
		RETURNING id
	`, user.ID, "uploads/"+key, key).Scan(&mediaFileID))
	_, err = db.Pool.Exec(ctx, `DELETE FROM media_files WHERE id=$1`, mediaFileID)
	require.NoError(t, err)

	worker := NewRetentionWorker(db.Pool, nil, storage, config.RetentionConfig{})
	worker.cleanupDeletedUserMedia(ctx)

	var remaining int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM media_file_deletion_queue WHERE storage_path=$1
	`, key).Scan(&remaining))
	require.Zero(t, remaining)
	_, err = storage.Download(ctx, key)
	require.Error(t, err)
}

func TestRetentionWorkerPassesCanonicalOwnedKeyToRemoteStorage(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &models.User{Username: "remote_media_outbox_user", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	key := fmt.Sprintf("%d/voice/%s.webm", user.ID, uuid.NewString())
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO media_file_deletion_queue(
			storage_path,owner_user_id,storage_scope
		) VALUES($1,$2,'canonical_owned')
	`, key, user.ID)
	require.NoError(t, err)

	storage := &deletionRecordingStorage{}
	worker := NewRetentionWorker(db.Pool, nil, storage, config.RetentionConfig{})
	worker.cleanupDeletedUserMedia(ctx)

	require.Equal(t, []string{key}, storage.deleted)
	var remaining int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM media_file_deletion_queue WHERE storage_path=$1
	`, key).Scan(&remaining))
	require.Zero(t, remaining)
}

func TestRetentionWorkerDeadLettersUserMediaOwnedByDifferentUser(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &models.User{Username: "media_owner_guard_user", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	storage, err := services.NewLocalStorageService(t.TempDir(), "http://media.test")
	require.NoError(t, err)
	key := fmt.Sprintf("%d/%s.png", user.ID+1, uuid.NewString())
	_, err = storage.Upload(ctx, key, strings.NewReader("image"), "image/png")
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO media_file_deletion_queue(
			storage_path,owner_user_id,storage_scope
		) VALUES($1,$2,'canonical_owned')
	`, key, user.ID)
	require.NoError(t, err)

	worker := NewRetentionWorker(db.Pool, nil, storage, config.RetentionConfig{})
	worker.cleanupDeletedUserMedia(ctx)

	var status, errorCode string
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT status,last_error_code
		FROM media_file_deletion_queue
		WHERE storage_path=$1
	`, key).Scan(&status, &errorCode))
	require.Equal(t, "dead_letter", status)
	require.Equal(t, "invalid_storage_path", errorCode)
	download, err := storage.Download(ctx, key)
	require.NoError(t, err)
	require.NoError(t, download.Close())
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

func TestRetentionWorkerPurgesExpiredOmniChatRequestIdempotencyRows(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))
	user := &models.User{Username: "request_id_retention_user", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	oldID, freshID := uuid.New(), uuid.New()
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_request_idempotency(user_id,client_request_id,scope,resource_key,payload_hash,status,response_json,updated_at)
		VALUES
		($1,$2,'chat_send','conversation:1',repeat('a',64),'completed','{}'::jsonb,NOW()-INTERVAL '8 days'),
		($1,$3,'chat_send','conversation:2',repeat('b',64),'completed','{}'::jsonb,NOW()-INTERVAL '1 day')
	`, user.ID, oldID, freshID)
	require.NoError(t, err)
	worker := NewRetentionWorker(db.Pool, nil, nil, config.RetentionConfig{})
	worker.cleanupExpiredOmniChatRequestIdempotency(ctx)
	var oldCount, freshCount int
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM omnichat_request_idempotency WHERE client_request_id=$1`, oldID).Scan(&oldCount))
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM omnichat_request_idempotency WHERE client_request_id=$1`, freshID).Scan(&freshCount))
	require.Zero(t, oldCount)
	require.Equal(t, 1, freshCount)
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
	attached, err := callRepository.AttachCallProviderOwned(ctx, call.ID, user.ID, "runpod_livekit", "abandoned-provider-call")
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

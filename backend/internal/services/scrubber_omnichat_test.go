package services

import (
	"context"
	"strings"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestScrubUserDeletesOmniChatSpeechBeforeCascadeAndFailsClosedWithoutVoiceStorage(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &models.User{Username: "scrub_voice_user", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO bot_personas(slug,name,category,system_prompt,visibility,source_format,is_active,owner_user_id) VALUES('scrub-voice','Scrub Voice','original','Stay in character.','private','native',TRUE,$1) RETURNING id`, user.ID).Scan(&personaID))
	conversation, err := models.NewBotConversationRepository(db.Pool).Create(ctx, user.ID, personaID, nil, nil)
	require.NoError(t, err)
	message, err := models.NewBotMessageRepository(db.Pool).Create(ctx, conversation.ID, models.BotMessageRoleAssistant, "Hello", false)
	require.NoError(t, err)

	voiceStorage, err := NewLocalStorageService(t.TempDir(), "http://voice.test")
	require.NoError(t, err)
	const key = "omnichat/speech/7/11/aaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-123e4567-e89b-12d3-a456-426614174000.mp3"
	_, err = voiceStorage.Upload(ctx, key, strings.NewReader("audio"), "audio/mpeg")
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `INSERT INTO omnichat_speech_audio(id,owner_user_id,persona_id,message_id,text_hash,voice_config_hash,storage_path,file_size) VALUES(gen_random_uuid(),$1,$2,$3,repeat('a',64),repeat('b',64),$4,5)`, user.ID, personaID, message.ID, key)
	require.NoError(t, err)

	scrubber := NewScrubberService(db.Pool, voiceStorage)
	err = scrubber.ScrubUser(ctx, user.ID)
	require.EqualError(t, err, "OmniChat voice storage is unavailable for permanent deletion")
	var speechCount, userCount int
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM omnichat_speech_audio WHERE storage_path=$1`, key).Scan(&speechCount))
	require.Equal(t, 1, speechCount)
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE id=$1`, user.ID).Scan(&userCount))
	require.Equal(t, 1, userCount)

	require.NoError(t, scrubber.SetVoiceStorage(voiceStorage).ScrubUser(ctx, user.ID))
	_, err = voiceStorage.Download(ctx, key)
	require.Error(t, err)
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM omnichat_speech_deletion_queue WHERE storage_path=$1`, key).Scan(&speechCount))
	require.Zero(t, speechCount)
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE id=$1`, user.ID).Scan(&userCount))
	require.Zero(t, userCount)
}

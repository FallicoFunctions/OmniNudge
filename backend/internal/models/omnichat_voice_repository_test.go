package models_test

import (
	"context"
	"strings"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestOmniChatVoiceRepositoryStartsOnlyOneActiveCallPerUser(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &models.User{Username: "voice_call_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO bot_personas(slug,name,category,system_prompt,visibility,source_format,is_active) VALUES('voice-call-owner','Voice Call','original','Stay in character.','public','native',TRUE) RETURNING id`).Scan(&personaID))
	conversation, err := models.NewBotConversationRepository(db.Pool).Create(ctx, user.ID, personaID, nil, nil)
	require.NoError(t, err)
	repository := models.NewOmniChatVoiceRepository(db.Pool)

	first, err := repository.StartCallOwned(ctx, user.ID, conversation.ID, "voice")
	require.NoError(t, err)
	second, err := repository.StartCallOwned(ctx, user.ID, conversation.ID, "video")
	require.NoError(t, err)
	require.NotEqual(t, first.ID, second.ID)

	var active, ended int
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FILTER (WHERE status='active'),COUNT(*) FILTER (WHERE status='ended') FROM omnichat_call_sessions WHERE user_id=$1`, user.ID).Scan(&active, &ended))
	require.Equal(t, 1, active)
	require.Equal(t, 1, ended)
	updated, err := repository.IncrementCallTurnOwned(ctx, second.ID, user.ID)
	require.NoError(t, err)
	require.True(t, updated)
	updated, err = repository.IncrementCallTurnOwned(ctx, second.ID, user.ID+1000)
	require.NoError(t, err)
	require.False(t, updated, "a foreign call ID must not be reported as updated")
}

func TestOmniChatVoiceRepositorySpeechCacheUpsertReturnsCanonicalRow(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &models.User{Username: "speech_cache_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO bot_personas(slug,name,category,system_prompt,visibility,source_format,is_active) VALUES('speech-cache-owner','Speech Cache','original','Stay in character.','public','native',TRUE) RETURNING id`).Scan(&personaID))
	conversation, err := models.NewBotConversationRepository(db.Pool).Create(ctx, user.ID, personaID, nil, nil)
	require.NoError(t, err)
	message, err := models.NewBotMessageRepository(db.Pool).Create(ctx, conversation.ID, models.BotMessageRoleAssistant, "Hello", false)
	require.NoError(t, err)
	repository := models.NewOmniChatVoiceRepository(db.Pool)
	first := &models.OmniChatSpeechAudio{OwnerUserID: user.ID, PersonaID: personaID, MessageID: message.ID, TextHash: strings.Repeat("a", 64), VoiceConfigHash: strings.Repeat("b", 64), StoragePath: "omnichat/speech/cache.mp3", FileType: "audio/mpeg", FileSize: 5}
	require.NoError(t, repository.SaveSpeechAudio(ctx, first))
	second := &models.OmniChatSpeechAudio{OwnerUserID: user.ID, PersonaID: personaID, MessageID: message.ID, TextHash: first.TextHash, VoiceConfigHash: first.VoiceConfigHash, StoragePath: first.StoragePath, FileType: "audio/mpeg", FileSize: 5}
	require.NoError(t, repository.SaveSpeechAudio(ctx, second))

	require.Equal(t, first.ID, second.ID)
	require.Equal(t, first.StoragePath, second.StoragePath)
}

func TestOmniChatVoiceRepositoryDoesNotExposePrivatePersonaVoice(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "private_voice_owner", PasswordHash: "hash", Role: "user"}
	other := &models.User{Username: "private_voice_other", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))
	require.NoError(t, users.Create(ctx, other))
	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO bot_personas(slug,name,category,system_prompt,visibility,source_format,is_active,owner_user_id) VALUES('private-voice','Private Voice','original','Stay in character.','private','native',TRUE,$1) RETURNING id`, owner.ID).Scan(&personaID))
	repository := models.NewOmniChatVoiceRepository(db.Pool)

	ownerVoice, err := repository.GetPersonaVoiceAccessible(ctx, personaID, owner.ID)
	require.NoError(t, err)
	require.NotNil(t, ownerVoice)
	require.False(t, ownerVoice.UpdatedAt.IsZero(), "default profiles should expose the character's current revision time")
	foreignVoice, err := repository.GetPersonaVoiceAccessible(ctx, personaID, other.ID)
	require.NoError(t, err)
	require.Nil(t, foreignVoice)
}

func TestOmniChatVoiceRepositoryRevokesSpeechAndCallsWithPersonaAccess(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	user := &models.User{Username: "revoked_voice_user", PasswordHash: "hash", Role: "user"}
	newOwner := &models.User{Username: "revoked_voice_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, user))
	require.NoError(t, users.Create(ctx, newOwner))
	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO bot_personas(slug,name,category,system_prompt,visibility,source_format,is_active) VALUES('revoked-voice','Revoked Voice','original','Stay in character.','public','native',TRUE) RETURNING id`).Scan(&personaID))
	conversation, err := models.NewBotConversationRepository(db.Pool).Create(ctx, user.ID, personaID, nil, nil)
	require.NoError(t, err)
	message, err := models.NewBotMessageRepository(db.Pool).Create(ctx, conversation.ID, models.BotMessageRoleAssistant, "Hello", false)
	require.NoError(t, err)
	repository := models.NewOmniChatVoiceRepository(db.Pool)

	_, err = db.Pool.Exec(ctx, `UPDATE bot_personas SET is_active=FALSE WHERE id=$1`, personaID)
	require.NoError(t, err)
	source, err := repository.GetSpeechSourceOwned(ctx, user.ID, conversation.ID, message.ID)
	require.NoError(t, err)
	require.Nil(t, source, "disabled characters must no longer synthesize speech from stale conversations")
	call, err := repository.StartCallOwned(ctx, user.ID, conversation.ID, "voice")
	require.NoError(t, err)
	require.Nil(t, call, "disabled characters must no longer start calls from stale conversations")

	_, err = db.Pool.Exec(ctx, `UPDATE bot_personas SET is_active=TRUE,owner_user_id=$2,visibility='private' WHERE id=$1`, personaID, newOwner.ID)
	require.NoError(t, err)
	source, err = repository.GetSpeechSourceOwned(ctx, user.ID, conversation.ID, message.ID)
	require.NoError(t, err)
	require.Nil(t, source, "private-character ownership changes must revoke speech access")
	call, err = repository.StartCallOwned(ctx, user.ID, conversation.ID, "video")
	require.NoError(t, err)
	require.Nil(t, call, "private-character ownership changes must revoke call access")
}

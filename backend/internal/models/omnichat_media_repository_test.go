package models_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestOmniChatMediaRepositoryGenerationLifecycleIsOwnerScoped(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "om_media_owner", PasswordHash: "hash", Role: "user"}
	other := &models.User{Username: "om_media_other", PasswordHash: "hash", Role: "user"}
	require.NoError(t, userRepo.Create(ctx, owner))
	require.NoError(t, userRepo.Create(ctx, other))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, category, system_prompt, visibility, source_format, is_active)
		VALUES ('media-test-persona', 'Media Test', 'original', 'Stay in character.', 'public', 'native', TRUE)
		RETURNING id
	`).Scan(&personaID))

	conversationRepo := models.NewBotConversationRepository(db.Pool)
	conversation, err := conversationRepo.Create(ctx, owner.ID, personaID, nil, nil)
	require.NoError(t, err)
	messageRepo := models.NewBotMessageRepository(db.Pool)
	userMessage, err := messageRepo.Create(ctx, conversation.ID, models.BotMessageRoleUser, "Show me the park", false)
	require.NoError(t, err)

	normalized, err := services.NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind:            models.OmniChatMediaKindImage,
		Mode:            models.OmniChatGenerationModeContextual,
		PersonaID:       personaID,
		ConversationID:  &conversation.ID,
		SourceMessageID: &userMessage.ID,
		Prompt:          "Show me what you are wearing",
		Scene: models.OmniChatSceneState{
			Location: "the park",
			Outfit:   "red coat",
		},
	})
	require.NoError(t, err)

	repo := models.NewOmniChatMediaRepository(db.Pool)
	job, err := repo.CreateGenerationJob(ctx, owner.ID, normalized, "test")
	require.NoError(t, err)
	require.Equal(t, models.OmniChatGenerationStatusQueued, job.Status)

	foreignView, err := repo.GetGenerationJobOwned(ctx, job.ID, other.ID)
	require.NoError(t, err)
	require.Nil(t, foreignView)

	marked, err := repo.MarkGenerationJobRunning(ctx, job.ID, "provider-request")
	require.NoError(t, err)
	require.True(t, marked)

	media := &models.MediaFile{
		UserID: owner.ID, Filename: "generated.png", OriginalFilename: "generated.png",
		FileType: "image/png", FileSize: 1024, StorageURL: "https://cdn.example.test/generated.png",
		StoragePath: "omnichat/generated/test.png", ScanStatus: models.MediaScanStatusClean,
	}
	asset := &models.OmniChatMediaAsset{}
	media.FileSize = 0
	require.EqualError(t, repo.CompleteGenerationJob(ctx, job.ID, media, asset, 1<<30, 50<<30), "generated media file size must be positive")
	media.FileSize = 1024
	require.NoError(t, repo.CompleteGenerationJob(ctx, job.ID, media, asset, 1<<30, 50<<30))
	require.NotEqual(t, uuid.Nil, asset.ID)
	require.Equal(t, models.OmniChatAssetVisibilityPrivate, asset.Visibility)

	completed, err := repo.GetGenerationJobOwned(ctx, job.ID, owner.ID)
	require.NoError(t, err)
	require.Equal(t, models.OmniChatGenerationStatusSucceeded, completed.Status)
	require.NotNil(t, completed.OutputAssetID)
	require.NotNil(t, completed.OutputMessageID)

	messages, err := messageRepo.ListByConversationID(ctx, conversation.ID, 20)
	require.NoError(t, err)
	require.Len(t, messages, 2)
	require.Len(t, messages[1].Attachments, 1)
	require.Equal(t, asset.ID, messages[1].Attachments[0].ID)

	var trackedBytes int64
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT storage_used_bytes FROM users WHERE id = $1`, owner.ID).Scan(&trackedBytes))
	require.Equal(t, int64(1024), trackedBytes)

	secondJob, err := repo.CreateGenerationJob(ctx, owner.ID, normalized, "test")
	require.NoError(t, err)
	marked, err = repo.MarkGenerationJobRunning(ctx, secondJob.ID, "provider-request-2")
	require.NoError(t, err)
	require.True(t, marked)
	secondMedia := &models.MediaFile{
		UserID: owner.ID, Filename: "generated-2.png", OriginalFilename: "generated-2.png",
		FileType: "image/png", FileSize: 2048, StorageURL: "https://cdn.example.test/generated-2.png",
		StoragePath: "omnichat/generated/test-2.png", ScanStatus: models.MediaScanStatusClean,
	}
	secondAsset := &models.OmniChatMediaAsset{}
	require.NoError(t, repo.CompleteGenerationJob(ctx, secondJob.ID, secondMedia, secondAsset, 1<<30, 50<<30))
	sharedCreatedAt := "2026-07-21T00:00:00Z"
	_, err = db.Pool.Exec(ctx, `UPDATE omnichat_media_assets SET created_at=$1 WHERE id=ANY($2)`, sharedCreatedAt, []uuid.UUID{asset.ID, secondAsset.ID})
	require.NoError(t, err)

	firstPage, err := repo.ListMediaAssetsOwned(ctx, owner.ID, nil, nil, 1)
	require.NoError(t, err)
	require.Len(t, firstPage, 1)
	secondPage, err := repo.ListMediaAssetsOwned(ctx, owner.ID, nil, &models.OmniChatMediaCursor{CreatedAt: firstPage[0].CreatedAt, ID: firstPage[0].ID}, 1)
	require.NoError(t, err)
	require.Len(t, secondPage, 1)
	require.NotEqual(t, firstPage[0].ID, secondPage[0].ID, "composite gallery cursors must not skip equal timestamps")
}

func TestOmniChatMediaRepositoryCancelsRunningGeneration(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "om_media_cancel_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, userRepo.Create(ctx, owner))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, category, system_prompt, visibility, source_format, is_active)
		VALUES ('media-cancel-persona', 'Media Cancel', 'original', 'Stay in character.', 'public', 'native', TRUE)
		RETURNING id
	`).Scan(&personaID))

	normalized, err := services.NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeCreate,
		PersonaID: personaID, Prompt: "Portrait at sunset",
	})
	require.NoError(t, err)
	repo := models.NewOmniChatMediaRepository(db.Pool)
	job, err := repo.CreateGenerationJob(ctx, owner.ID, normalized, "test")
	require.NoError(t, err)
	marked, err := repo.MarkGenerationJobRunning(ctx, job.ID, "provider-request")
	require.NoError(t, err)
	require.True(t, marked)

	cancelled, err := repo.CancelGenerationJobOwned(ctx, job.ID, owner.ID)
	require.NoError(t, err)
	require.True(t, cancelled)

	stored, err := repo.GetGenerationJobOwned(ctx, job.ID, owner.ID)
	require.NoError(t, err)
	require.Equal(t, models.OmniChatGenerationStatusCancelled, stored.Status)
}

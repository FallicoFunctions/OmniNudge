package models_test

import (
	"context"
	"fmt"
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
	job, err := repo.CreateGenerationJob(ctx, owner.ID, withGenerationBillingReservation(t, ctx, db.Pool, owner.ID, normalized), "test")
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
		StoragePath: fmt.Sprintf("omnichat/generated/%d/%s.png", owner.ID, job.ID), ScanStatus: models.MediaScanStatusClean,
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

	original, err := conversationRepo.GetByID(ctx, conversation.ID, owner.ID)
	require.NoError(t, err)
	original.Persona, err = models.NewBotPersonaRepository(db.Pool).GetByID(ctx, personaID)
	require.NoError(t, err)
	fork, err := conversationRepo.ForkConversation(ctx, owner.ID, original)
	require.NoError(t, err)
	require.NotNil(t, fork)
	forkedMessages, err := messageRepo.ListByConversationID(ctx, fork.ID, 20)
	require.NoError(t, err)
	require.Len(t, forkedMessages, 2)
	require.Len(t, forkedMessages[1].Attachments, 1)
	require.Equal(t, asset.ID, forkedMessages[1].Attachments[0].ID)

	deleted, err := models.NewBotPersonaRepository(db.Pool).DeleteOwned(ctx, owner.ID, personaID)
	require.NoError(t, err)
	require.False(t, deleted, "catalog personas are not user-owned")

	ownedPersona, err := models.NewBotPersonaRepository(db.Pool).CreateOwned(ctx, owner.ID, &models.BotPersona{
		Slug:               "media-deletable-persona",
		Name:               "Deletable Persona",
		Category:           models.PersonaCategoryOriginal,
		Visibility:         "private",
		SourceFormat:       "native",
		SystemPrompt:       "Stay in character.",
		FirstMessage:       "Hello.",
		AlternateGreetings: []string{},
		Tags:               []string{},
		GalleryURLs:        []string{},
		ExtensionsJSON:     []byte(`{}`),
	})
	require.NoError(t, err)
	deletionRequest := withGenerationBillingReservation(t, ctx, db.Pool, owner.ID, models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeCreate,
		PersonaID: ownedPersona.ID, Prompt: "A quiet room", EffectivePrompt: "A quiet room", AspectRatio: "1:1",
	})
	deletionJob, err := repo.CreateGenerationJob(ctx, owner.ID, deletionRequest, "test")
	require.NoError(t, err)
	deleted, err = models.NewBotPersonaRepository(db.Pool).DeleteOwned(ctx, owner.ID, ownedPersona.ID)
	require.NoError(t, err)
	require.True(t, deleted)
	deletedPersona, err := models.NewBotPersonaRepository(db.Pool).GetAccessibleByID(ctx, ownedPersona.ID, &owner.ID)
	require.NoError(t, err)
	require.Nil(t, deletedPersona)
	cancelledJob, err := repo.GetGenerationJobOwned(ctx, deletionJob.ID, owner.ID)
	require.NoError(t, err)
	require.Equal(t, models.OmniChatGenerationStatusCancelled, cancelledJob.Status)
	preservedAsset, err := repo.GetMediaAssetOwned(ctx, asset.ID, owner.ID)
	require.NoError(t, err)
	require.NotNil(t, preservedAsset, "deleting a persona must not orphan or erase its existing gallery media")

	var trackedBytes int64
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT storage_used_bytes FROM users WHERE id = $1`, owner.ID).Scan(&trackedBytes))
	require.Equal(t, int64(1024), trackedBytes)

	secondJob, err := repo.CreateGenerationJob(ctx, owner.ID, withGenerationBillingReservation(t, ctx, db.Pool, owner.ID, normalized), "test")
	require.NoError(t, err)
	marked, err = repo.MarkGenerationJobRunning(ctx, secondJob.ID, "provider-request-2")
	require.NoError(t, err)
	require.True(t, marked)
	secondMedia := &models.MediaFile{
		UserID: owner.ID, Filename: "generated-2.png", OriginalFilename: "generated-2.png",
		FileType: "image/png", FileSize: 2048, StorageURL: "https://cdn.example.test/generated-2.png",
		StoragePath: fmt.Sprintf("omnichat/generated/%d/%s.png", owner.ID, secondJob.ID), ScanStatus: models.MediaScanStatusClean,
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

	deletedAsset, err := repo.DeleteMediaAssetOwned(ctx, secondAsset.ID, other.ID)
	require.NoError(t, err)
	require.False(t, deletedAsset, "foreign owners must not learn whether an asset exists")

	_, err = db.Pool.Exec(ctx, `UPDATE media_files SET user_id=$1 WHERE id=$2`, other.ID, secondMedia.ID)
	require.NoError(t, err)
	deletedAsset, err = repo.DeleteMediaAssetOwned(ctx, secondAsset.ID, owner.ID)
	require.NoError(t, err)
	require.False(t, deletedAsset, "asset and media-file ownership must agree before deletion")
	_, err = db.Pool.Exec(ctx, `UPDATE media_files SET user_id=$1 WHERE id=$2`, owner.ID, secondMedia.ID)
	require.NoError(t, err)

	groupID := uuid.New()
	groupMessageID := uuid.New()
	_, err = db.Pool.Exec(ctx, `INSERT INTO omnichat_groups(id,owner_user_id,name) VALUES($1,$2,'Media group')`, groupID, owner.ID)
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_group_messages(id,group_id,sender_type,sender_user_id,content)
		VALUES($1,$2,'user',$3,'Shared in the group')
	`, groupMessageID, groupID, owner.ID)
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `INSERT INTO omnichat_group_message_attachments(message_id,asset_id) VALUES($1,$2)`, groupMessageID, secondAsset.ID)
	require.NoError(t, err)
	deletedAsset, err = repo.DeleteMediaAssetOwned(ctx, secondAsset.ID, owner.ID)
	require.ErrorIs(t, err, models.ErrOmniChatMediaInUse)
	require.False(t, deletedAsset)
	_, err = db.Pool.Exec(ctx, `DELETE FROM omnichat_group_message_attachments WHERE message_id=$1 AND asset_id=$2`, groupMessageID, secondAsset.ID)
	require.NoError(t, err)

	deletedAsset, err = repo.DeleteMediaAssetOwned(ctx, secondAsset.ID, owner.ID)
	require.NoError(t, err)
	require.True(t, deletedAsset)
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT storage_used_bytes FROM users WHERE id = $1
	`, owner.ID).Scan(&trackedBytes))
	require.Equal(t, int64(1024), trackedBytes)
	var queuedPath string
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT storage_path FROM omnichat_media_deletion_queue WHERE storage_path = $1
	`, secondMedia.StoragePath).Scan(&queuedPath))
	require.Equal(t, secondMedia.StoragePath, queuedPath)
	deletedView, err := repo.GetMediaAssetOwned(ctx, secondAsset.ID, owner.ID)
	require.NoError(t, err)
	require.Nil(t, deletedView)

	socialRepo := models.NewOmniChatSocialRepository(db.Pool)
	publication, err := socialRepo.PublishAssetOwned(ctx, owner.ID, asset.ID, "Shared scene")
	require.NoError(t, err)
	deletedAsset, err = repo.DeleteMediaAssetOwned(ctx, asset.ID, owner.ID)
	require.ErrorIs(t, err, models.ErrOmniChatMediaInUse)
	require.False(t, deletedAsset)
	removed, err := socialRepo.RemovePublicationOwned(ctx, publication.ID, owner.ID)
	require.NoError(t, err)
	require.True(t, removed)
	deletedAsset, err = repo.DeleteMediaAssetOwned(ctx, asset.ID, owner.ID)
	require.NoError(t, err)
	require.True(t, deletedAsset, "unpublished media should be deletable")
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT storage_used_bytes FROM users WHERE id = $1
	`, owner.ID).Scan(&trackedBytes))
	require.Zero(t, trackedBytes)
}

func TestIsOmniChatGeneratedStoragePath(t *testing.T) {
	itemID := uuid.New()
	require.True(t, models.IsOmniChatGeneratedStoragePath(fmt.Sprintf("omnichat/generated/7/%s.png", itemID)))
	require.True(t, models.IsOmniChatGeneratedStoragePathForOwner(fmt.Sprintf("omnichat/generated/7/%s.mp4", itemID), 7))
	require.False(t, models.IsOmniChatGeneratedStoragePathForOwner(fmt.Sprintf("omnichat/generated/7/%s.png", itemID), 8))
	for _, unsafe := range []string{
		"", "/omnichat/generated/7/item.png", "omnichat/generated/../secret",
		"omnichat/generated//item.png", `omnichat\generated\item.png`, "uploads/item.png",
		"omnichat/generated/0/" + itemID.String() + ".png",
		"omnichat/generated/7/not-a-uuid.png",
		"omnichat/generated/7/" + itemID.String() + ".exe",
		"omnichat/generated/7/" + itemID.String() + ".PNG",
	} {
		require.False(t, models.IsOmniChatGeneratedStoragePath(unsafe), unsafe)
	}
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
	job, err := repo.CreateGenerationJob(ctx, owner.ID, withGenerationBillingReservation(t, ctx, db.Pool, owner.ID, normalized), "test")
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

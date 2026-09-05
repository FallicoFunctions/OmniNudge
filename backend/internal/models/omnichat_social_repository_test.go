package models_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestOmniChatSocialRepositoryPublishEngageAndContinueLifecycle(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "om_social_owner", PasswordHash: "hash", Role: "user"}
	reader := &models.User{Username: "om_social_reader", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))
	require.NoError(t, users.Create(ctx, reader))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, category, system_prompt, visibility, source_format, is_active)
		VALUES ('social-test-persona', 'Sadie', 'original', 'Stay in character.', 'public', 'native', TRUE)
		RETURNING id
	`).Scan(&personaID))

	conversations := models.NewBotConversationRepository(db.Pool)
	conversation, err := conversations.Create(ctx, owner.ID, personaID, nil, nil)
	require.NoError(t, err)
	messages := models.NewBotMessageRepository(db.Pool)
	userMessage, err := messages.Create(ctx, conversation.ID, models.BotMessageRoleUser, "We meet in the park.", false)
	require.NoError(t, err)
	assistantMessage, err := messages.Create(ctx, conversation.ID, models.BotMessageRoleAssistant, "I wave from beside the fountain.", false)
	require.NoError(t, err)

	request, err := services.NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeCreate,
		PersonaID: personaID, Prompt: "Sadie beside the park fountain",
	})
	require.NoError(t, err)
	mediaRepo := models.NewOmniChatMediaRepository(db.Pool)
	job, err := mediaRepo.CreateGenerationJob(ctx, owner.ID, withGenerationBillingReservation(t, ctx, db.Pool, owner.ID, request), "test")
	require.NoError(t, err)
	require.True(t, mustMarkRunning(t, ctx, mediaRepo, job.ID))
	asset := &models.OmniChatMediaAsset{}
	require.NoError(t, mediaRepo.CompleteGenerationJob(ctx, job.ID, &models.MediaFile{
		UserID: owner.ID, Filename: "social.png", OriginalFilename: "social.png",
		FileType: "image/png", FileSize: 1024, StorageURL: "https://cdn.example.test/social.png",
		StoragePath: "omnichat/generated/social.png", ScanStatus: models.MediaScanStatusClean,
	}, asset, 1<<30, 50<<30, models.OmniChatGenerationProvenance{}))

	social := models.NewOmniChatSocialRepository(db.Pool)
	publication, err := social.PublishAssetOwned(ctx, owner.ID, asset.ID, "A day at the park")
	require.NoError(t, err)
	require.Equal(t, models.OmniChatPublicationKindImage, publication.ContentKind)
	duplicate, err := social.PublishAssetOwned(ctx, owner.ID, asset.ID, "A day at the park")
	require.NoError(t, err)
	require.Equal(t, publication.ID, duplicate.ID, "publishing the same asset should be idempotent")

	foreignPublication, err := social.PublishAssetOwned(ctx, reader.ID, asset.ID, "stolen")
	require.NoError(t, err)
	require.Nil(t, foreignPublication)

	require.NoError(t, social.SetPublicationLiked(ctx, publication.ID, reader.ID, true))
	comment, err := social.AddPublicationComment(ctx, publication.ID, reader.ID, nil, "This scene is wonderful.")
	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, comment.ID)
	require.NoError(t, social.RecordPublicationShare(ctx, publication.ID, reader.ID))

	loaded, err := social.GetPublicationAccessible(ctx, publication.ID, &reader.ID)
	require.NoError(t, err)
	require.NotNil(t, loaded)
	require.Equal(t, 1, loaded.LikeCount)
	require.Equal(t, 1, loaded.CommentCount)
	require.Equal(t, 1, loaded.ShareCount)
	require.True(t, loaded.ViewerLiked)
	secondComment, err := social.AddPublicationComment(ctx, publication.ID, reader.ID, nil, "I would visit this park too.")
	require.NoError(t, err)
	require.NotNil(t, secondComment)
	sharedCommentTime := time.Now().UTC().Truncate(time.Microsecond)
	_, err = db.Pool.Exec(ctx, `UPDATE omnichat_publication_comments SET created_at=$1 WHERE publication_id=$2`, sharedCommentTime, publication.ID)
	require.NoError(t, err)
	firstComments, err := social.ListPublicationComments(ctx, publication.ID, &owner.ID, nil, 1)
	require.NoError(t, err)
	require.Len(t, firstComments, 1)
	nextComments, err := social.ListPublicationComments(ctx, publication.ID, &owner.ID, &models.OmniChatCommentCursor{
		CreatedAt: firstComments[0].CreatedAt,
		ID:        firstComments[0].ID,
	}, 1)
	require.NoError(t, err)
	require.Len(t, nextComments, 1)
	require.NotEqual(t, firstComments[0].ID, nextComments[0].ID, "composite cursors must not skip comments sharing a timestamp")
	_, err = db.Pool.Exec(ctx, `UPDATE users SET banned=TRUE WHERE id=$1`, reader.ID)
	require.NoError(t, err)
	bannedAuthorComments, err := social.ListPublicationComments(ctx, publication.ID, &owner.ID, nil, 50)
	require.NoError(t, err)
	require.Empty(t, bannedAuthorComments, "comments from a banned account must disappear from public threads")
	require.NoError(t, social.SetPublicationLiked(ctx, publication.ID, reader.ID, false))
	require.NoError(t, social.SetPublicationLiked(ctx, publication.ID, reader.ID, true))
	bannedComment, err := social.AddPublicationComment(ctx, publication.ID, reader.ID, nil, "A banned account cannot post.")
	require.NoError(t, err)
	require.Nil(t, bannedComment)
	require.NoError(t, social.SetPublicationBookmarked(ctx, publication.ID, reader.ID, true))
	var bannedEngagements int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT (SELECT COUNT(*) FROM omnichat_publication_reactions WHERE publication_id=$1 AND user_id=$2)
		     + (SELECT COUNT(*) FROM omnichat_publication_bookmarks WHERE publication_id=$1 AND user_id=$2)
	`, publication.ID, reader.ID).Scan(&bannedEngagements))
	require.Zero(t, bannedEngagements, "a banned account must not mutate public engagement directly through the repository")
	_, err = db.Pool.Exec(ctx, `UPDATE users SET banned=FALSE WHERE id=$1`, reader.ID)
	require.NoError(t, err)

	shareMessageIDs := []int{userMessage.ID, assistantMessage.ID}
	shareText, shareDigest, err := social.ReadChatShareTextOwned(ctx, owner.ID, conversation.ID, shareMessageIDs)
	require.NoError(t, err)
	require.Contains(t, shareText, "beside the fountain")
	chatPublishRequestID := uuid.New()
	chatPublication, err := social.PublishChatSnapshotOwned(ctx, owner.ID, conversation.ID,
		shareMessageIDs, "Meeting Sadie", "A conversation worth sharing", shareDigest, chatPublishRequestID)
	require.NoError(t, err)
	require.Equal(t, models.OmniChatPublicationKindChat, chatPublication.ContentKind)
	replayedChatPublication, err := social.PublishChatSnapshotOwned(ctx, owner.ID, conversation.ID,
		shareMessageIDs, "Meeting Sadie", "A conversation worth sharing", shareDigest, chatPublishRequestID)
	require.NoError(t, err)
	require.Equal(t, chatPublication.ID, replayedChatPublication.ID, "chat publication retries must be idempotent")
	crossPublicationReply, err := social.AddPublicationComment(ctx, chatPublication.ID, reader.ID, &comment.ID, "Wrong thread")
	require.NoError(t, err)
	require.Nil(t, crossPublicationReply, "a reply parent must belong to the same publication")

	continueRequestID := uuid.New()
	continued, err := social.ContinueChatSnapshot(ctx, chatPublication.ID, reader.ID, continueRequestID)
	require.NoError(t, err)
	require.Equal(t, personaID, continued.PersonaID)
	continuedMessages, err := messages.ListByConversationID(ctx, continued.ID, 10)
	require.NoError(t, err)
	require.Len(t, continuedMessages, 2)
	require.Equal(t, "We meet in the park.", continuedMessages[0].Content)
	replayedContinuation, err := social.ContinueChatSnapshot(ctx, chatPublication.ID, reader.ID, continueRequestID)
	require.NoError(t, err)
	require.Equal(t, continued.ID, replayedContinuation.ID, "continuation retries must be idempotent")

	_, err = db.Pool.Exec(ctx, `UPDATE omnichat_publications SET is_nsfw=TRUE WHERE id=$1`, chatPublication.ID)
	require.NoError(t, err)
	nsfwHiddenContinuation, err := social.ContinueChatSnapshot(ctx, chatPublication.ID, reader.ID, uuid.New())
	require.NoError(t, err)
	require.Nil(t, nsfwHiddenContinuation, "continuation must enforce the viewer's NSFW preference just like the publication read path")
	_, err = db.Pool.Exec(ctx, `UPDATE users SET nsfw=TRUE WHERE id=$1`, reader.ID)
	require.NoError(t, err)
	nsfwAllowedContinuation, err := social.ContinueChatSnapshot(ctx, chatPublication.ID, reader.ID, uuid.New())
	require.NoError(t, err)
	require.NotNil(t, nsfwAllowedContinuation)
	_, err = db.Pool.Exec(ctx, `UPDATE omnichat_publications SET is_nsfw=FALSE WHERE id=$1`, chatPublication.ID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `UPDATE users SET banned=TRUE WHERE id=$1`, owner.ID)
	require.NoError(t, err)
	bannedAuthorContinuation, err := social.ContinueChatSnapshot(ctx, chatPublication.ID, reader.ID, uuid.New())
	require.NoError(t, err)
	require.Nil(t, bannedAuthorContinuation, "hidden content from a banned author must not remain continuable by direct UUID")
	_, err = db.Pool.Exec(ctx, `UPDATE users SET banned=FALSE WHERE id=$1`, owner.ID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `UPDATE bot_personas SET is_active=FALSE WHERE id=$1`, personaID)
	require.NoError(t, err)
	inactiveContinuation, err := social.ContinueChatSnapshot(ctx, chatPublication.ID, reader.ID, uuid.New())
	require.NoError(t, err)
	require.Nil(t, inactiveContinuation, "a shared chat must not revive a disabled character")
	_, err = db.Pool.Exec(ctx, `UPDATE bot_personas SET is_active=TRUE WHERE id=$1`, personaID)
	require.NoError(t, err)

	feed, err := social.ListExplore(ctx, &reader.ID, "", nil, 20)
	require.NoError(t, err)
	require.Len(t, feed, 2)
	sharedPublishedAt := time.Now().UTC().Truncate(time.Microsecond)
	_, err = db.Pool.Exec(ctx, `UPDATE omnichat_publications SET published_at=$1`, sharedPublishedAt)
	require.NoError(t, err)
	firstPage, err := social.ListExplore(ctx, &reader.ID, "", nil, 1)
	require.NoError(t, err)
	require.Len(t, firstPage, 1)
	secondPage, err := social.ListExplore(ctx, &reader.ID, "", &models.OmniChatExploreCursor{PublishedAt: firstPage[0].PublishedAt, ID: firstPage[0].ID}, 1)
	require.NoError(t, err)
	require.Len(t, secondPage, 1)
	require.NotEqual(t, firstPage[0].ID, secondPage[0].ID, "composite cursors must not skip publications sharing a timestamp")

	publicPath, publicType, err := social.PublicAssetStoragePath(ctx, asset.ID, &reader.ID)
	require.NoError(t, err)
	require.Equal(t, "omnichat/generated/social.png", publicPath)
	require.Equal(t, "image/png", publicType)
	_, err = db.Pool.Exec(ctx, `UPDATE users SET banned=TRUE WHERE id=$1`, owner.ID)
	require.NoError(t, err)
	bannedAuthorPath, _, err := social.PublicAssetStoragePath(ctx, asset.ID, &reader.ID)
	require.NoError(t, err)
	require.Empty(t, bannedAuthorPath, "a banned author's hidden publication must not remain available through the raw media route")
	_, err = db.Pool.Exec(ctx, `UPDATE users SET banned=FALSE WHERE id=$1`, owner.ID)
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `INSERT INTO blocked_users(blocker_id,blocked_id) VALUES($1,$2)`, owner.ID, reader.ID)
	require.NoError(t, err)
	blockedPath, _, err := social.PublicAssetStoragePath(ctx, asset.ID, &reader.ID)
	require.NoError(t, err)
	require.Empty(t, blockedPath, "a blocked viewer must not bypass Explore through the media content route")
	_, err = db.Pool.Exec(ctx, `DELETE FROM omnichat_publication_shares WHERE publication_id=$1 AND user_id=$2`, publication.ID, reader.ID)
	require.NoError(t, err)
	require.NoError(t, social.RecordPublicationShare(ctx, publication.ID, reader.ID))
	require.NoError(t, social.SetPublicationBookmarked(ctx, publication.ID, reader.ID, true))
	var blockedEngagements int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT (SELECT COUNT(*) FROM omnichat_publication_shares WHERE publication_id=$1 AND user_id=$2)
		     + (SELECT COUNT(*) FROM omnichat_publication_bookmarks WHERE publication_id=$1 AND user_id=$2)
	`, publication.ID, reader.ID).Scan(&blockedEngagements))
	require.Zero(t, blockedEngagements, "blocked users must not engage through direct write endpoints")
	visibleComments, err := social.ListPublicationComments(ctx, publication.ID, &owner.ID, nil, 50)
	require.NoError(t, err)
	require.Empty(t, visibleComments, "comments from blocked accounts must not leak through the direct comments endpoint")

	removed, err := social.RemovePublicationOwned(ctx, publication.ID, owner.ID)
	require.NoError(t, err)
	require.True(t, removed)
	var visibility models.OmniChatAssetVisibility
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT visibility FROM omnichat_media_assets WHERE id=$1`, asset.ID).Scan(&visibility))
	require.Equal(t, models.OmniChatAssetVisibilityPrivate, visibility, "unpublishing must restore the gallery asset's private state")
	republished, err := social.PublishAssetOwned(ctx, owner.ID, asset.ID, "Published again")
	require.NoError(t, err)
	require.NotNil(t, republished)
	require.NotEqual(t, publication.ID, republished.ID)
}

func mustMarkRunning(t *testing.T, ctx context.Context, repo *models.OmniChatMediaRepository, id uuid.UUID) bool {
	t.Helper()
	marked, err := repo.MarkGenerationJobRunning(ctx, id, "social-provider-job")
	require.NoError(t, err)
	return marked
}

// The thumbnail answers to exactly the people the asset answers to.
//
// Both go through one gate constant, but a shared constant only proves the two
// queries read the same text -- it says nothing about whether the second query
// binds it correctly. This runs the thumbnail path against the real schema
// through every state the gate exists to refuse, beside the asset path that has
// always been checked this way. A thumbnail readable by somebody the asset is
// not would leak the picture in miniature.
func TestAPublishedThumbnailIsGatedExactlyAsItsAssetIs(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "thumb_gate_owner", PasswordHash: "hash", Role: "user"}
	reader := &models.User{Username: "thumb_gate_reader", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))
	require.NoError(t, users.Create(ctx, reader))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, category, system_prompt, visibility, source_format, is_active)
		VALUES ('thumb-gate-persona', 'Sadie', 'original', 'Stay in character.', 'public', 'native', TRUE)
		RETURNING id`).Scan(&personaID))

	request, err := services.NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeCreate,
		PersonaID: personaID, Prompt: "Sadie beside the park fountain",
	})
	require.NoError(t, err)
	mediaRepo := models.NewOmniChatMediaRepository(db.Pool)
	job, err := mediaRepo.CreateGenerationJob(ctx, owner.ID, withGenerationBillingReservation(t, ctx, db.Pool, owner.ID, request), "test")
	require.NoError(t, err)
	require.True(t, mustMarkRunning(t, ctx, mediaRepo, job.ID))

	// The key the worker really writes, built by the function that writes it,
	// so this cannot drift away from the shape in storage.
	assetKey := fmt.Sprintf("omnichat/generated/%d/%s.png", owner.ID, job.ID)
	thumbnailKey, ok := models.OmniChatThumbnailKeyFor(assetKey)
	require.True(t, ok)

	asset := &models.OmniChatMediaAsset{}
	thumbnailURL := "/uploads/" + thumbnailKey
	require.NoError(t, mediaRepo.CompleteGenerationJob(ctx, job.ID, &models.MediaFile{
		UserID: owner.ID, Filename: "still.png", OriginalFilename: "still.png",
		FileType: "image/png", FileSize: 1024, StorageURL: "/uploads/" + assetKey,
		StoragePath: assetKey, ThumbnailURL: &thumbnailURL, ScanStatus: models.MediaScanStatusClean,
	}, asset, 1<<30, 50<<30, models.OmniChatGenerationProvenance{}))

	social := models.NewOmniChatSocialRepository(db.Pool)

	// Unpublished: the asset exists and nobody outside may have either part.
	strangerKey, err := social.PublicAssetThumbnailPath(ctx, asset.ID, &reader.ID)
	require.NoError(t, err)
	require.Empty(t, strangerKey, "an unpublished thumbnail was readable")

	_, err = social.PublishAssetOwned(ctx, owner.ID, asset.ID, "A day at the park")
	require.NoError(t, err)

	published, err := social.PublicAssetThumbnailPath(ctx, asset.ID, &reader.ID)
	require.NoError(t, err)
	require.Equal(t, thumbnailKey, published)
	anonymous, err := social.PublicAssetThumbnailPath(ctx, asset.ID, nil)
	require.NoError(t, err)
	require.Equal(t, thumbnailKey, anonymous, "a published thumbnail must be readable without an account")

	_, err = db.Pool.Exec(ctx, `UPDATE users SET banned=TRUE WHERE id=$1`, owner.ID)
	require.NoError(t, err)
	bannedKey, err := social.PublicAssetThumbnailPath(ctx, asset.ID, &reader.ID)
	require.NoError(t, err)
	require.Empty(t, bannedKey, "a banned author's thumbnail stayed readable")
	_, err = db.Pool.Exec(ctx, `UPDATE users SET banned=FALSE WHERE id=$1`, owner.ID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `INSERT INTO blocked_users(blocker_id,blocked_id) VALUES($1,$2)`, owner.ID, reader.ID)
	require.NoError(t, err)
	blockedKey, err := social.PublicAssetThumbnailPath(ctx, asset.ID, &reader.ID)
	require.NoError(t, err)
	require.Empty(t, blockedKey, "a blocked viewer read the thumbnail the asset would have refused them")
	_, err = db.Pool.Exec(ctx, `DELETE FROM blocked_users WHERE blocker_id=$1 AND blocked_id=$2`, owner.ID, reader.ID)
	require.NoError(t, err)

	// The two answers must agree, which is the point of one gate.
	assetPath, _, err := social.PublicAssetStoragePath(ctx, asset.ID, &reader.ID)
	require.NoError(t, err)
	require.Equal(t, assetKey, assetPath)
}

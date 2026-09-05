package database_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
)

// An asset's thumbnail is a second object under a second key, and it is not a
// media_files row of its own. Deleting the asset queued only the asset, so the
// thumbnail stayed in storage with nothing left in the database that names it
// -- unreachable, and findable only by listing the bucket.
//
// Written against the real schema because the object is handed to the retention
// worker by a row in a table, and a fake store cannot show whether that row is
// written.
func TestDeletingAnAssetQueuesItsThumbnailToo(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "thumbnail_deletion_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))

	jobID := uuid.New()
	clipKey := fmt.Sprintf("omnichat/generated/%d/%s.mp4", owner.ID, jobID)
	thumbnailKey := fmt.Sprintf("omnichat/generated/%d/%s-thumb.jpg", owner.ID, jobID)

	var fileID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO media_files (user_id, filename, file_type, file_size, storage_url, storage_path, thumbnail_url, width, height, duration)
		VALUES ($1, 'clip.mp4', 'video/mp4', 2200000, $2, $3, $4, 1080, 1896, 7)
		RETURNING id`, owner.ID, "/uploads/"+clipKey, clipKey, "/uploads/"+thumbnailKey).Scan(&fileID))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (name, slug, description, system_prompt, is_active)
		VALUES ('thumb probe', 'thumb-probe', 'probe', 'probe', true)
		RETURNING id`).Scan(&personaID))

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_generation_jobs (id, owner_user_id, persona_id, kind, mode, status,
			prompt, effective_prompt, aspect_ratio, duration_seconds, billing_required)
		VALUES ($1,$2,$3,'video','contextual','succeeded','a clip','a clip','9:16',6,false)`,
		jobID, owner.ID, personaID)
	require.NoError(t, err)

	assetID := uuid.New()
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_media_assets (id, owner_user_id, persona_id, generation_job_id, media_file_id,
			kind, visibility, prompt, scene_snapshot, width, height, duration_seconds, safety_status)
		VALUES ($1,$2,$3,$4,$5,'video','private','a clip','{}',1080,1896,7,'approved')`,
		assetID, owner.ID, personaID, jobID, fileID)
	require.NoError(t, err)

	media := models.NewOmniChatMediaRepository(db.Pool)

	// The thumbnail round-trips at all: thumbnail_url is in a hand-written column
	// list, so a field the worker writes can still read back as nothing.
	read, err := media.GetMediaAssetOwned(ctx, assetID, owner.ID)
	require.NoError(t, err)
	require.NotNil(t, read.ThumbnailURL)
	require.Equal(t, "/uploads/"+thumbnailKey, *read.ThumbnailURL)

	deleted, err := media.DeleteMediaAssetOwned(ctx, assetID, owner.ID)
	require.NoError(t, err)
	require.True(t, deleted)

	var queued int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_deletion_queue WHERE storage_path = $1`, clipKey).Scan(&queued))
	require.Equal(t, 1, queued, "the asset itself was not queued")

	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_deletion_queue WHERE storage_path = $1`, thumbnailKey).Scan(&queued))
	require.Equal(t, 1, queued, "the thumbnail outlived the asset it belongs to")
}

// The publication select and its scanner are both hand-written, so a field
// added to the public asset struct is populated by nothing while reading as
// correct -- ledger 390b0e4c R2 was exactly that, on model_id. This reads a
// published asset back through the feed and requires the thumbnail to have
// survived the trip.
func TestAPublishedAssetReportsThatItHasAThumbnail(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "thumbnail_publish_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, category, system_prompt, visibility, source_format, is_active)
		VALUES ('thumb-feed-persona', 'Sadie', 'original', 'Stay in character.', 'public', 'native', TRUE)
		RETURNING id`).Scan(&personaID))

	withThumbnail := publishOneAsset(ctx, t, db, owner.ID, personaID, "thumb-yes", true)
	withoutThumbnail := publishOneAsset(ctx, t, db, owner.ID, personaID, "thumb-no", false)

	social := models.NewOmniChatSocialRepository(db.Pool)

	loaded, err := social.GetPublicationAccessible(ctx, withThumbnail, &owner.ID)
	require.NoError(t, err)
	require.NotNil(t, loaded)
	require.NotNil(t, loaded.Asset)
	require.True(t, loaded.Asset.HasThumbnail, "the published asset reported no thumbnail")

	loaded, err = social.GetPublicationAccessible(ctx, withoutThumbnail, &owner.ID)
	require.NoError(t, err)
	require.NotNil(t, loaded)
	require.NotNil(t, loaded.Asset)
	require.False(t, loaded.Asset.HasThumbnail, "an asset with no thumbnail claimed one")
}

// publishOneAsset stores a clip, optionally with a thumbnail beside it, and
// publishes it. It returns the publication id.
func publishOneAsset(ctx context.Context, t *testing.T, db *database.DB, ownerID, personaID int, slug string, thumb bool) uuid.UUID {
	t.Helper()
	jobID := uuid.New()
	clipKey := fmt.Sprintf("omnichat/generated/%d/%s.mp4", ownerID, jobID)
	var thumbnail *string
	if thumb {
		value := fmt.Sprintf("/uploads/omnichat/generated/%d/%s-thumb.jpg", ownerID, jobID)
		thumbnail = &value
	}

	var fileID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO media_files (user_id, filename, file_type, file_size, storage_url, storage_path, thumbnail_url, width, height, duration)
		VALUES ($1, $2, 'video/mp4', 2200000, $3, $4, $5, 1080, 1896, 7)
		RETURNING id`, ownerID, slug+".mp4", "/uploads/"+clipKey, clipKey, thumbnail).Scan(&fileID))

	_, err := db.Pool.Exec(ctx, `
		INSERT INTO omnichat_generation_jobs (id, owner_user_id, persona_id, kind, mode, status,
			prompt, effective_prompt, aspect_ratio, duration_seconds, billing_required)
		VALUES ($1,$2,$3,'video','contextual','succeeded','a clip','a clip','9:16',6,false)`,
		jobID, ownerID, personaID)
	require.NoError(t, err)

	assetID := uuid.New()
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_media_assets (id, owner_user_id, persona_id, generation_job_id, media_file_id,
			kind, visibility, prompt, scene_snapshot, width, height, duration_seconds, safety_status)
		VALUES ($1,$2,$3,$4,$5,'video','private','a clip','{}',1080,1896,7,'approved')`,
		assetID, ownerID, personaID, jobID, fileID)
	require.NoError(t, err)

	social := models.NewOmniChatSocialRepository(db.Pool)
	publication, err := social.PublishAssetOwned(ctx, ownerID, assetID, "a clip")
	require.NoError(t, err)
	require.NotNil(t, publication)
	return publication.ID
}

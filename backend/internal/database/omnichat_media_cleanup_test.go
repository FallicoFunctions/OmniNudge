package database_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
)

// The likeness flow renders four candidates and keeps one. Discarding the other
// three has to actually remove the stored objects, and the whole design rests
// on that being free: migration 161 puts the trigger on media_files rather than
// on omnichat_media_assets, so a candidate never needs to be an asset to be
// cleaned up.
//
// That was read out of the migration and believed. It is worth executing before
// anything is built on it, because if it were wrong the alternative design --
// candidates as assets, filtered out of seventeen queries -- would be forced,
// and the cost of finding out later is orphaned objects nobody is billed for
// noticing.
func TestDiscardingAGeneratedFileQueuesItsObjectForDeletion(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "likeness_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))

	const generated = "omnichat/generated/9/candidate-one.png"
	var fileID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO media_files (user_id, filename, file_type, file_size, storage_url, storage_path)
		VALUES ($1, 'candidate-one.png', 'image/png', 1024, 'https://example.test/c1.png', $2)
		RETURNING id`, owner.ID, generated).Scan(&fileID))

	// Nothing is queued while the file exists.
	var queued int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_deletion_queue WHERE storage_path = $1`,
		generated).Scan(&queued))
	require.Zero(t, queued)

	_, err = db.Pool.Exec(ctx, `DELETE FROM media_files WHERE id = $1`, fileID)
	require.NoError(t, err)

	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_deletion_queue WHERE storage_path = $1`,
		generated).Scan(&queued))
	require.Equal(t, 1, queued, "deleting the row is what hands the object to the retention worker")
}

func TestOnlyGeneratedObjectsAreQueued(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "upload_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))

	// An ordinary upload is not generated media and must not be swept by a
	// worker that exists to clean up renders.
	const uploaded = "uploads/9/holiday.png"
	var fileID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO media_files (user_id, filename, file_type, file_size, storage_url, storage_path)
		VALUES ($1, 'holiday.png', 'image/png', 1024, 'https://example.test/h.png', $2)
		RETURNING id`, owner.ID, uploaded).Scan(&fileID))
	_, err = db.Pool.Exec(ctx, `DELETE FROM media_files WHERE id = $1`, fileID)
	require.NoError(t, err)

	var queued int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_deletion_queue WHERE storage_path = $1`,
		uploaded).Scan(&queued))
	require.Zero(t, queued)
}

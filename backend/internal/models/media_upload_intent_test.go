package models_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestMediaUploadIntentReservesQuotaFinalizesIdempotentlyAndRollsBack(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	user := testutil.NewFixtures(t, db).CreateUniqueUser("direct_upload")
	repo := models.NewMediaFileRepository(db.Pool)
	ctx := context.Background()

	intent := testUploadIntent(user.ID, 60)
	require.NoError(t, repo.ReserveUploadIntent(ctx, intent, 100))
	require.True(t, errors.Is(repo.ReserveUploadIntent(ctx, testUploadIntent(user.ID, 50), 100), models.ErrMediaQuotaExceeded))

	mediaID, replay, err := repo.FinalizeUploadIntent(ctx, intent.ID, user.ID, 60, 100, "https://cdn.example/"+intent.StoragePath)
	require.NoError(t, err)
	require.False(t, replay)
	require.Positive(t, mediaID)

	replayedID, replay, err := repo.FinalizeUploadIntent(ctx, intent.ID, user.ID, 60, 100, "https://cdn.example/"+intent.StoragePath)
	require.NoError(t, err)
	require.True(t, replay)
	require.Equal(t, mediaID, replayedID)

	var used int64
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT storage_used_bytes FROM users WHERE id=$1`, user.ID).Scan(&used))
	require.Equal(t, int64(60), used)
	require.NoError(t, repo.RollbackConfirmedUpload(ctx, intent.ID, user.ID, "queue unavailable"))
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT storage_used_bytes FROM users WHERE id=$1`, user.ID).Scan(&used))
	require.Zero(t, used)
	media, err := repo.GetByID(ctx, mediaID)
	require.NoError(t, err)
	require.Nil(t, media)
}

func testUploadIntent(userID int, size int64) *models.MediaUploadIntent {
	id := uuid.New()
	return &models.MediaUploadIntent{
		ID: id, UserID: userID,
		StoragePath:      fmt.Sprintf("pending-uploads/%d/%s/file.jpg", userID, id),
		OriginalFilename: "file.jpg", ContentType: "image/jpeg", DeclaredSize: size,
		ChecksumSHA256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
		ExpiresAt:      time.Now().UTC().Add(time.Hour),
	}
}

package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func mediaFile(userID int) *domain.MediaFile {
	ts := time.Now().UnixNano()
	return &domain.MediaFile{
		UserID:           userID,
		Filename:         fmt.Sprintf("file_%d.jpg", ts),
		OriginalFilename: fmt.Sprintf("original_%d.jpg", ts),
		FileType:         "image",
		FileSize:         1024,
		StorageURL:       fmt.Sprintf("https://storage.example.com/%d.jpg", ts),
		StoragePath:      fmt.Sprintf("/media/%d.jpg", ts),
		ScanStatus:       "clean",
	}
}

func TestPostgresMediaFileRepository_Create(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMediaFileRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("mf_create_u")
	mf := mediaFile(user.ID)

	err := repo.Create(ctx, mf)
	require.NoError(t, err)
	assert.NotZero(t, mf.ID)
}

func TestPostgresMediaFileRepository_GetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMediaFileRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("mf_byid_u")
	mf := mediaFile(user.ID)
	_ = repo.Create(ctx, mf)

	tests := []struct {
		name    string
		id      int
		wantNil bool
	}{
		{"existing", mf.ID, false},
		{"non-existent", 999999, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByID(ctx, tc.id)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NotNil(t, got)
				assert.Equal(t, mf.ID, got.ID)
			}
		})
	}
}

func TestPostgresMediaFileRepository_GetByStorageURL(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMediaFileRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("mf_byurl_u")
	mf := mediaFile(user.ID)
	_ = repo.Create(ctx, mf)

	got, err := repo.GetByStorageURL(ctx, mf.StorageURL)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, mf.ID, got.ID)
}

func TestPostgresMediaFileRepository_GetTotalStorageByUserID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMediaFileRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("mf_storage_u")
	mf := mediaFile(user.ID)
	_ = repo.Create(ctx, mf)

	total, err := repo.GetTotalStorageByUserID(ctx, user.ID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, total, int64(1024))
}

func TestPostgresMediaFileRepository_DeleteByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMediaFileRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("mf_del_u")
	mf := mediaFile(user.ID)
	_ = repo.Create(ctx, mf)

	err := repo.DeleteByID(ctx, mf.ID)
	require.NoError(t, err)

	// After deletion, GetByID returns (nil, nil) — row is gone.
	got, err := repo.GetByID(ctx, mf.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestPostgresMediaFileRepository_UpdateThumbnailURL(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMediaFileRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("mf_thumb_u")
	mf := mediaFile(user.ID)
	_ = repo.Create(ctx, mf)

	err := repo.UpdateThumbnailURL(ctx, mf.ID, "https://thumbs.example.com/thumb.jpg")
	assert.NoError(t, err)
}

func TestPostgresMediaFileRepository_MarkScanStatus(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMediaFileRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("mf_scan_u")
	mf := mediaFile(user.ID)
	_ = repo.Create(ctx, mf)

	err := repo.MarkScanClean(ctx, mf.ID)
	require.NoError(t, err)

	errMsg := "virus detected"
	err = repo.MarkScanInfected(ctx, mf.ID, errMsg)
	require.NoError(t, err)
}

package queue

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/hibiken/asynq"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func setupThumbnailDB(t *testing.T) (*database.Database, *models.MediaFileRepository, int) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(context.Background()))
	require.NoError(t, database.ResetTestData(context.Background(), db))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     fmt.Sprintf("thumb_user_%d", time.Now().UnixNano()),
		PasswordHash: "hash",
	}
	require.NoError(t, userRepo.Create(context.Background(), user))

	return db, models.NewMediaFileRepository(db.Pool), user.ID
}

func createThumbnailTestMedia(t *testing.T, repo *models.MediaFileRepository, userID int, path, fileType string) *models.MediaFile {
	t.Helper()
	media := &models.MediaFile{
		UserID:           userID,
		Filename:         filepath.Base(path),
		OriginalFilename: filepath.Base(path),
		FileType:         fileType,
		FileSize:         64,
		StorageURL:       "/uploads/" + filepath.Base(path),
		StoragePath:      path,
	}
	require.NoError(t, repo.Create(context.Background(), media))
	return media
}

func TestThumbnailGenerationHandler_RejectsPendingScan(t *testing.T) {
	_, mediaRepo, userID := setupThumbnailDB(t)
	dir := t.TempDir()
	imagePath := filepath.Join(dir, "pending.png")
	require.NoError(t, os.WriteFile(imagePath, []byte{0x89, 0x50, 0x4E, 0x47}, 0o644))

	media := createThumbnailTestMedia(t, mediaRepo, userID, imagePath, "image/png")
	handler := NewThumbnailGenerationHandler(mediaRepo, services.NewThumbnailService())
	task := asynq.NewTask(string(JobTypeThumbnailGeneration), []byte(fmt.Sprintf(`{"file_id":%d}`, media.ID)))

	err := handler(context.Background(), task)
	require.Error(t, err)
	require.False(t, errors.Is(err, asynq.SkipRetry))
}

func TestThumbnailGenerationHandler_SkipRetryWhenScanInfected(t *testing.T) {
	_, mediaRepo, userID := setupThumbnailDB(t)
	dir := t.TempDir()
	imagePath := filepath.Join(dir, "infected.png")
	require.NoError(t, os.WriteFile(imagePath, []byte{0x89, 0x50, 0x4E, 0x47}, 0o644))

	media := createThumbnailTestMedia(t, mediaRepo, userID, imagePath, "image/png")
	require.NoError(t, mediaRepo.MarkScanInfected(context.Background(), media.ID, "infected"))

	handler := NewThumbnailGenerationHandler(mediaRepo, services.NewThumbnailService())
	task := asynq.NewTask(string(JobTypeThumbnailGeneration), []byte(fmt.Sprintf(`{"file_id":%d}`, media.ID)))

	err := handler(context.Background(), task)
	require.Error(t, err)
	require.True(t, errors.Is(err, asynq.SkipRetry))
}
